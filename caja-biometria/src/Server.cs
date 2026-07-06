// ============================================================================
// Ferremex — Servidor HTTP local del servicio de huella (127.0.0.1:52700).
// Expone el motor nativo dpfj/dpfpdd por HTTP/JSON para que el POS (navegador)
// lo orqueste. STATELESS respecto a plantillas: nunca las guarda; las recibe en
// el request o las devuelve en la respuesta. La huella nunca sale de la caja.
//
// Endpoints:
//   GET  /health            → vida + estado del lector
//   POST /capturar          → 1 captura → FMD (primitiva)
//   POST /capturar-enroll   → N capturas consolidadas → 1 plantilla (SSE de progreso)
//   POST /verificar-1a1     → captura + compara contra 1 plantilla (canje cliente)
//   POST /identificar-1aN   → captura + identifica entre N candidatos (acción empleado)
//   POST /cancelar          → aborta un captura_id en curso
// ============================================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

namespace Ferremex.Biometria
{
    public class Server
    {
        readonly Config _cfg;
        readonly HttpListener _listener = new HttpListener();
        // Un solo lector físico: serializamos las operaciones de captura.
        readonly object _deviceLock = new object();
        // Cancelación cooperativa por captura_id.
        readonly HashSet<string> _cancelados = new HashSet<string>();
        readonly object _cancelLock = new object();

        public Server(Config cfg)
        {
            _cfg = cfg;
            _listener.Prefixes.Add("http://127.0.0.1:" + cfg.Puerto + "/");
        }

        public void Start()
        {
            _listener.Start();
            Log.Info("Servicio de huella escuchando en http://127.0.0.1:" + _cfg.Puerto + "/");
            while (_listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = _listener.GetContext(); }
                catch (Exception) { break; }
                ThreadPool.QueueUserWorkItem(_ => Handle(ctx));
            }
        }

        // -------------------------------------------------------------------
        // Ruteo
        // -------------------------------------------------------------------
        void Handle(HttpListenerContext ctx)
        {
            var req = ctx.Request;
            var res = ctx.Response;
            // CORS: el POS corre en localhost:8080 (proxy Caddy) u otro origen local.
            res.AddHeader("Access-Control-Allow-Origin", "*");
            res.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.AddHeader("Access-Control-Allow-Headers", "Content-Type");

            try
            {
                if (req.HttpMethod == "OPTIONS") { Send(res, 204, ""); return; }

                string path = req.Url.AbsolutePath.TrimEnd('/');
                switch (path)
                {
                    case "/health": Health(res); break;
                    case "/capturar": Capturar(req, res); break;
                    case "/capturar-enroll": CapturarEnroll(req, res); break;
                    case "/verificar-1a1": Verificar1a1(req, res); break;
                    case "/identificar-1aN": Identificar1aN(req, res); break;
                    case "/cancelar": Cancelar(req, res); break;
                    default: Send(res, 404, JsonOut.Error("NO_ENCONTRADO", "Ruta desconocida: " + path)); break;
                }
            }
            catch (TimeoutDedoException ex)
            {
                Send(res, 408, JsonOut.Error("TIMEOUT_DEDO", ex.Message));
            }
            catch (CalidadException ex)
            {
                Send(res, 422, JsonOut.Error("CALIDAD_INSUFICIENTE", ex.Message));
            }
            catch (DpException ex)
            {
                Log.Error("Dp error: " + ex.Message);
                int http;
                string codigo;
                if ((ex.Code & 0xFFFF) == 0x1E) { http = 409; codigo = "LECTOR_OCUPADO"; }
                else { http = 422; codigo = "MOTOR"; }
                Send(res, http, JsonOut.Error(codigo, ex.Message));
            }
            catch (Exception ex)
            {
                Log.Error("Error inesperado: " + ex);
                try { Send(res, 500, JsonOut.Error("INTERNO", ex.Message)); } catch { }
            }
        }

        // -------------------------------------------------------------------
        // GET /health
        // -------------------------------------------------------------------
        void Health(HttpListenerResponse res)
        {
            string nombre = null;
            bool conectado = false;
            try { nombre = Dpfj.GetReaderName(); conectado = nombre != null; }
            catch (Exception ex) { Log.Error("health/GetReaderName: " + ex.Message); }

            var j = new JsonOut()
                .Bool("ok", true)
                .Str("servicio", "FerremexBiometriaService")
                .Str("version", Config.Version)
                .Raw("motor", "{\"nombre\":\"dpfj\",\"runtime\":\"3.5\"}")
                .Raw("lector", new JsonOut()
                    .Bool("conectado", conectado)
                    .Str("nombre", nombre)
                    .Str("modelo", conectado ? "U.are.U 4500" : null)
                    .End())
                .End();
            Send(res, 200, j);
        }

        // -------------------------------------------------------------------
        // POST /capturar — 1 captura → FMD
        // -------------------------------------------------------------------
        void Capturar(HttpListenerRequest req, HttpListenerResponse res)
        {
            var body = ReadJson(req);
            uint timeout = JsonIn.GetUint(body, "timeout_ms", _cfg.TimeoutMs);
            string capturaId = JsonIn.GetStr(body, "captura_id");

            Muestra m;
            lock (_deviceLock)
            {
                CheckCancelado(capturaId);
                m = Dpfj.CapturarMuestra(timeout);
            }
            LimpiarCancelado(capturaId);

            var j = new JsonOut()
                .Bool("ok", true)
                .Str("plantilla_b64", Convert.ToBase64String(m.Fmd))
                .Num("calidad", m.Calidad)
                .Str("formato", "ANSI_378_2004")
                .Raw("imagen", "{\"ancho\":" + m.Ancho + ",\"alto\":" + m.Alto + ",\"dpi\":" + m.Dpi + ",\"bpp\":8}")
                .End();
            Send(res, 200, j);
        }

        // -------------------------------------------------------------------
        // POST /capturar-enroll — N capturas → 1 plantilla, con progreso SSE
        // -------------------------------------------------------------------
        void CapturarEnroll(HttpListenerRequest req, HttpListenerResponse res)
        {
            var body = ReadJson(req);
            int muestras = JsonIn.GetInt(body, "muestras", _cfg.MuestrasEnroll);
            uint timeout = JsonIn.GetUint(body, "timeout_ms_por_muestra", _cfg.TimeoutMs);
            string capturaId = JsonIn.GetStr(body, "captura_id");

            // Responder como stream SSE.
            res.StatusCode = 200;
            res.ContentType = "text/event-stream; charset=utf-8";
            res.AddHeader("Cache-Control", "no-cache");
            res.SendChunked = true;
            var w = new StreamWriter(res.OutputStream, new UTF8Encoding(false));

            Action<string, string> emit = (evt, data) =>
            {
                lock (w) { w.Write("event: " + evt + "\n"); w.Write("data: " + data + "\n\n"); w.Flush(); }
            };

            try
            {
                Muestra fmd;
                lock (_deviceLock)
                {
                    fmd = Dpfj.CapturarEnroll(muestras, timeout,
                        onEsperando: (i, tot, q) => emit("progreso", "{\"fase\":\"esperando_dedo\",\"muestra\":" + i + ",\"total\":" + tot + "}"),
                        onMuestraOk: (i, tot, q) => emit("progreso", "{\"fase\":\"muestra_ok\",\"muestra\":" + i + ",\"total\":" + tot + ",\"calidad\":" + q + "}"),
                        cancelado: () => EsCancelado(capturaId));
                }
                LimpiarCancelado(capturaId);
                emit("resultado", new JsonOut()
                    .Bool("ok", true)
                    .Str("plantilla_b64", Convert.ToBase64String(fmd.Fmd))
                    .Num("calidad", fmd.Calidad)
                    .Num("muestras_usadas", muestras)
                    .Str("formato", "ANSI_378_2004")
                    .End());
            }
            catch (DpException ex)
            {
                string codigo = ex.Message.Contains("Cancelado") ? "CANCELADO" : "ENROLL_FALLIDO";
                emit("error", JsonOut.Error(codigo, ex.Message));
            }
            catch (Exception ex)
            {
                emit("error", JsonOut.Error("INTERNO", ex.Message));
            }
            finally { try { w.Close(); } catch { } }
        }

        // -------------------------------------------------------------------
        // POST /verificar-1a1 — canje cliente
        // -------------------------------------------------------------------
        void Verificar1a1(HttpListenerRequest req, HttpListenerResponse res)
        {
            var body = ReadJson(req);
            string plantillaB64 = JsonIn.GetStr(body, "plantilla_b64");
            uint umbral = JsonIn.GetUint(body, "umbral", _cfg.UmbralCliente);
            uint timeout = JsonIn.GetUint(body, "timeout_ms", _cfg.TimeoutMs);
            string capturaId = JsonIn.GetStr(body, "captura_id");

            if (string.IsNullOrEmpty(plantillaB64)) { Send(res, 400, JsonOut.Error("SIN_PLANTILLA", "Falta plantilla_b64")); return; }
            byte[] fmdGuardada = Convert.FromBase64String(plantillaB64);

            Muestra m;
            lock (_deviceLock)
            {
                CheckCancelado(capturaId);
                m = Dpfj.CapturarMuestra(timeout);
            }
            LimpiarCancelado(capturaId);

            uint score = Dpfj.Comparar(m.Fmd, fmdGuardada);
            bool match = score <= umbral;

            var j = new JsonOut()
                .Bool("ok", true)
                .Bool("match", match)
                .Num("score", score)
                .Num("umbral", umbral)
                .Num("calidad_captura", m.Calidad)
                .End();
            Send(res, 200, j);
        }

        // -------------------------------------------------------------------
        // POST /identificar-1aN — acción empleado
        // -------------------------------------------------------------------
        void Identificar1aN(HttpListenerRequest req, HttpListenerResponse res)
        {
            var body = ReadJson(req);
            uint umbral = JsonIn.GetUint(body, "umbral", _cfg.UmbralEmpleado);
            uint timeout = JsonIn.GetUint(body, "timeout_ms", _cfg.TimeoutMs);
            string capturaId = JsonIn.GetStr(body, "captura_id");
            var candArr = JsonIn.GetArray(body, "candidatos");

            // Extraer candidatos (sujeto_ref + plantilla) preservando el orden para mapear el índice.
            var refs = new List<string>();
            var fmds = new List<byte[]>();
            foreach (var o in candArr)
            {
                var c = o as Dictionary<string, object>;
                if (c == null) continue;
                string sref = JsonIn.GetStr(c, "sujeto_ref");
                string pb64 = JsonIn.GetStr(c, "plantilla_b64");
                if (string.IsNullOrEmpty(pb64)) continue;
                refs.Add(sref);
                fmds.Add(Convert.FromBase64String(pb64));
            }

            if (fmds.Count == 0) { Send(res, 400, JsonOut.Error("SIN_CANDIDATOS", "No se enviaron candidatos válidos")); return; }

            Muestra m;
            lock (_deviceLock)
            {
                CheckCancelado(capturaId);
                m = Dpfj.CapturarMuestra(timeout);
            }
            LimpiarCancelado(capturaId);

            uint bestScore;
            int idx = Dpfj.Identificar(m.Fmd, fmds, umbral, out bestScore);

            JsonOut j;
            if (idx >= 0)
            {
                j = new JsonOut()
                    .Bool("ok", true).Bool("match", true)
                    .Str("sujeto_ref", refs[idx])
                    .Num("score", bestScore)
                    .Num("umbral", umbral)
                    .Num("candidatos_evaluados", fmds.Count)
                    .Num("calidad_captura", m.Calidad);
            }
            else
            {
                j = new JsonOut()
                    .Bool("ok", true).Bool("match", false)
                    .Null("sujeto_ref")
                    .Num("candidatos_evaluados", fmds.Count)
                    .Num("calidad_captura", m.Calidad);
            }
            Send(res, 200, j.End());
        }

        // -------------------------------------------------------------------
        // POST /cancelar
        // -------------------------------------------------------------------
        void Cancelar(HttpListenerRequest req, HttpListenerResponse res)
        {
            var body = ReadJson(req);
            string capturaId = JsonIn.GetStr(body, "captura_id");
            if (!string.IsNullOrEmpty(capturaId))
                lock (_cancelLock) { _cancelados.Add(capturaId); }
            Send(res, 200, "{\"ok\":true}");
        }

        // -------------------------------------------------------------------
        // Cancelación cooperativa
        // -------------------------------------------------------------------
        bool EsCancelado(string id) { if (string.IsNullOrEmpty(id)) return false; lock (_cancelLock) return _cancelados.Contains(id); }
        void CheckCancelado(string id) { if (EsCancelado(id)) { LimpiarCancelado(id); throw new DpException("Cancelado", 0); } }
        void LimpiarCancelado(string id) { if (string.IsNullOrEmpty(id)) return; lock (_cancelLock) _cancelados.Remove(id); }

        // -------------------------------------------------------------------
        // Utilidades HTTP
        // -------------------------------------------------------------------
        static Dictionary<string, object> ReadJson(HttpListenerRequest req)
        {
            if (!req.HasEntityBody) return new Dictionary<string, object>();
            using (var r = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8))
            {
                string s = r.ReadToEnd();
                if (string.IsNullOrWhiteSpace(s)) return new Dictionary<string, object>();
                return JsonIn.Parse(s);
            }
        }

        static void Send(HttpListenerResponse res, int status, string body)
        {
            res.StatusCode = status;
            if (string.IsNullOrEmpty(body)) { res.ContentLength64 = 0; res.Close(); return; }
            var bytes = Encoding.UTF8.GetBytes(body);
            res.ContentType = "application/json; charset=utf-8";
            res.ContentLength64 = bytes.Length;
            res.OutputStream.Write(bytes, 0, bytes.Length);
            res.Close();
        }
    }
}
