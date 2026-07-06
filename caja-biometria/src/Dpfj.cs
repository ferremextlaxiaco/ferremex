// ============================================================================
// Ferremex — Capa nativa del lector de huella (DigitalPersona U.are.U SDK).
// Envuelve dpfpdd.dll (captura) + dpfj.dll (extracción/comparación de FMD).
// Las firmas P/Invoke están validadas por el spike (score 0 en mismo dedo, FMD 440B).
//
// El motor es intercambiable a nivel de servicio: si algún día se cambia de dpfj a
// otro extractor, SOLO se reescribe esta clase; el contrato HTTP no cambia.
//
// Convención de score: dpfj devuelve DISIMILITUD (0 = idéntico, alto = distinto).
// ============================================================================
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Ferremex.Biometria
{
    /// <summary>Resultado de una captura+extracción: la plantilla FMD en bytes.</summary>
    public class Muestra
    {
        public byte[] Fmd;
        public int Calidad;      // 0-100
        public uint Ancho, Alto, Dpi;
    }

    /// <summary>Excepción con el código nativo dpfpdd/dpfj para diagnóstico.</summary>
    public class DpException : Exception
    {
        public int Code;
        public DpException(string msg, int code) : base(msg + " (rc=0x" + code.ToString("X8") + ")") { Code = code; }
    }

    /// <summary>No se detectó el dedo (timeout / sin dedo). El cliente debe reintentar.</summary>
    public class TimeoutDedoException : DpException
    {
        public TimeoutDedoException() : base("No se detectó el dedo a tiempo, reintente", 0) { }
    }

    /// <summary>El dedo se leyó pero con mala calidad (mal puesto, sucio). Reintentar.</summary>
    public class CalidadException : DpException
    {
        public CalidadException(int quality) : base("Calidad de captura insuficiente (coloque bien el dedo)", quality) { }
    }

    /// <summary>Motor nativo DigitalPersona. NO thread-safe: el servicio serializa con un lock.</summary>
    public static class Dpfj
    {
        // ---- Formatos / constantes (del header público U.are.U SDK) ----
        const uint DPFPDD_IMG_FMT_PIXEL_BUFFER = 0;
        const uint DPFPDD_IMG_PROC_NONE = 0;
        const uint DPFPDD_QUALITY_GOOD = 0;
        // Códigos de calidad del capture (bitmask). 0 = GOOD.
        const uint DPFPDD_QUALITY_TIMED_OUT = 1;
        const uint DPFPDD_QUALITY_CANCELED = 1 << 1;
        const uint DPFPDD_QUALITY_NO_FINGER = 1 << 2;
        public const uint DPFJ_FMD_ANSI_378_2004 = 0x001B0001;
        const int DPFJ_FINGER_POSITION_UNKNOWN = 0;
        public const uint DPFJ_PROBABILITY_ONE = 0x7FFFFFFF; // FAR=1 → umbral = ONE * FAR_objetivo
        const int FMD_BUF = 4096;                            // MAX_FMD_SIZE ~2KB; holgura
        // Códigos de enrollment (dpfj). MORE_DATA en add_to_enrollment = ÉXITO
        // parcial ("faltan muestras"), NO error. ENROLLMENT_NOT_READY = create
        // llamado antes de tiempo.
        const uint DPFJ_E_MORE_DATA = 0x05BA000C;           // "faltan más FMDs"
        const uint DPFJ_E_ENROLLMENT_NOT_READY = 0x05BA012F;
        const int E_INVALID_PARAMETER = 0x14;
        const int E_DEVICE_BUSY = 0x1E;

        // ---- Estructuras de captura ----
        [StructLayout(LayoutKind.Sequential)]
        struct DPFPDD_CAPTURE_PARAM { public uint size, image_fmt, image_proc, image_res; }
        [StructLayout(LayoutKind.Sequential)]
        struct DPFPDD_IMAGE_INFO { public uint size, width, height, res, bpp; }
        [StructLayout(LayoutKind.Sequential)]
        struct DPFPDD_CAPTURE_RESULT { public uint size; public int success; public uint quality, score; public DPFPDD_IMAGE_INFO info; }

        // DPFPDD_DEV_INFO — 1450 bytes, Pack=1 (validado en spike).
        [StructLayout(LayoutKind.Sequential, Pack = 1, CharSet = CharSet.Ansi)]
        struct DPFPDD_DEV_INFO
        {
            public uint size;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)] public string name;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 384)] public byte[] descr;
            public ushort vendor_id, product_id;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 26)] public byte[] ver;
            public uint modality, technology;
        }

        // ---- dpfpdd (captura) ----
        [DllImport("dpfpdd.dll")] static extern int dpfpdd_init();
        [DllImport("dpfpdd.dll")] static extern int dpfpdd_exit();
        [DllImport("dpfpdd.dll")] static extern int dpfpdd_query_devices(ref uint dev_cnt, IntPtr dev_infos);
        [DllImport("dpfpdd.dll")] static extern int dpfpdd_query_devices(ref uint dev_cnt, [In, Out] DPFPDD_DEV_INFO[] dev_infos);
        [DllImport("dpfpdd.dll", CharSet = CharSet.Ansi)] static extern int dpfpdd_open(string dev_name, out IntPtr pdev);
        [DllImport("dpfpdd.dll")] static extern int dpfpdd_close(IntPtr dev);
        [DllImport("dpfpdd.dll")]
        static extern int dpfpdd_capture(IntPtr dev, ref DPFPDD_CAPTURE_PARAM p, uint timeout,
            ref DPFPDD_CAPTURE_RESULT r, ref uint imgSize, byte[] imgData);

        // ---- dpfj (extraer / comparar / identificar / enrolar) ----
        [DllImport("dpfj.dll")]
        static extern int dpfj_create_fmd_from_raw(byte[] img, uint imgSize, uint w, uint h, uint dpi,
            int fingerPos, uint cbeffId, uint fmdType, byte[] fmd, ref uint fmdSize);
        [DllImport("dpfj.dll")]
        static extern int dpfj_compare(uint t1, byte[] f1, uint s1, uint v1, uint t2, byte[] f2, uint s2, uint v2, ref uint score);
        [DllImport("dpfj.dll")]
        static extern int dpfj_identify(uint probeType, byte[] probe, uint probeSize, uint probeView,
            uint fmdsType, uint fmdsCnt, IntPtr[] fmds, uint[] fmdSizes, uint threshold,
            ref uint candCnt, [In, Out] DPFJ_CANDIDATE[] candidates);
        [DllImport("dpfj.dll")] static extern int dpfj_start_enrollment(uint fmdType);
        [DllImport("dpfj.dll")] static extern int dpfj_add_to_enrollment(uint fmdType, byte[] fmd, uint fmdSize, uint viewIdx);
        [DllImport("dpfj.dll")] static extern int dpfj_create_enrollment_fmd(byte[] fmd, ref uint fmdSize);
        [DllImport("dpfj.dll")] static extern int dpfj_finish_enrollment();

        [StructLayout(LayoutKind.Sequential)]
        struct DPFJ_CANDIDATE { public uint fmd_idx; public uint view_idx; }

        static bool _inited;

        // ------------------------------------------------------------------
        // Inicialización / info del lector
        // ------------------------------------------------------------------
        public static void EnsureInit()
        {
            if (_inited) return;
            int rc = dpfpdd_init();
            if (rc != 0) throw new DpException("dpfpdd_init falló", rc);
            _inited = true;
        }

        /// <summary>Nombre real del primer lector, o null si no hay ninguno. (open con "" da INVALID_PARAMETER.)</summary>
        public static string GetReaderName()
        {
            EnsureInit();
            uint cnt = 0;
            dpfpdd_query_devices(ref cnt, IntPtr.Zero);  // rc MORE_DATA es normal aquí
            if (cnt == 0) return null;
            var infos = new DPFPDD_DEV_INFO[cnt];
            for (int i = 0; i < cnt; i++)
            {
                infos[i].size = (uint)Marshal.SizeOf(typeof(DPFPDD_DEV_INFO));
                infos[i].name = ""; infos[i].descr = new byte[384]; infos[i].ver = new byte[26];
            }
            int rc = dpfpdd_query_devices(ref cnt, infos);
            if (rc != 0 || cnt == 0) return null;
            return string.IsNullOrEmpty(infos[0].name) ? null : infos[0].name;
        }

        // ------------------------------------------------------------------
        // Captura de UNA muestra (abre→captura→extrae→cierra). Serializado por el caller.
        // ------------------------------------------------------------------
        public static Muestra CapturarMuestra(uint timeoutMs)
        {
            EnsureInit();
            string name = GetReaderName();
            if (name == null) throw new DpException("No hay lector conectado", 0);

            IntPtr dev;
            int rc = dpfpdd_open(name, out dev);
            if (rc != 0)
            {
                if ((rc & 0xFFFF) == E_DEVICE_BUSY) throw new DpException("Lector ocupado por otro proceso", rc);
                throw new DpException("dpfpdd_open falló", rc);
            }
            try
            {
                var param = new DPFPDD_CAPTURE_PARAM
                {
                    size = (uint)Marshal.SizeOf(typeof(DPFPDD_CAPTURE_PARAM)),
                    image_fmt = DPFPDD_IMG_FMT_PIXEL_BUFFER,   // el 4500 acepta PIXEL_BUFFER @500
                    image_proc = DPFPDD_IMG_PROC_NONE,
                    image_res = 500
                };
                uint imgSize = 1024 * 1024;
                var buf = new byte[imgSize];
                var res = new DPFPDD_CAPTURE_RESULT { size = (uint)Marshal.SizeOf(typeof(DPFPDD_CAPTURE_RESULT)) };
                res.info.size = (uint)Marshal.SizeOf(typeof(DPFPDD_IMAGE_INFO));

                rc = dpfpdd_capture(dev, ref param, timeoutMs, ref res, ref imgSize, buf);
                if (rc != 0) throw new DpException("Captura falló", rc);
                // Distinguir timeout/sin-dedo (reintentar) de calidad real (dedo mal puesto).
                if (res.quality == DPFPDD_QUALITY_TIMED_OUT || (res.quality & DPFPDD_QUALITY_NO_FINGER) != 0)
                    throw new TimeoutDedoException();
                if ((res.quality & DPFPDD_QUALITY_CANCELED) != 0)
                    throw new DpException("Captura cancelada", 0);
                if (res.success == 0 || res.quality != DPFPDD_QUALITY_GOOD)
                    throw new CalidadException((int)res.quality);

                uint w = res.info.width, h = res.info.height, dpi = res.info.res == 0 ? 500 : res.info.res;
                var img = new byte[imgSize];
                Array.Copy(buf, img, (int)Math.Min(imgSize, (uint)buf.Length));

                var fmd = ExtraerFmd(img, w, h, dpi);
                // Calidad aproximada: el capture reporta 0=GOOD; mapear a 100 si extrajo, degradar por tamaño.
                int calidad = fmd != null ? EstimarCalidad(fmd) : 0;
                return new Muestra { Fmd = fmd, Calidad = calidad, Ancho = w, Alto = h, Dpi = dpi };
            }
            finally { dpfpdd_close(dev); }
        }

        static byte[] ExtraerFmd(byte[] img, uint w, uint h, uint dpi)
        {
            var fmd = new byte[FMD_BUF];
            uint fmdSize = FMD_BUF;
            int rc = dpfj_create_fmd_from_raw(img, (uint)img.Length, w, h, dpi,
                DPFJ_FINGER_POSITION_UNKNOWN, 0, DPFJ_FMD_ANSI_378_2004, fmd, ref fmdSize);
            if (rc != 0) throw new DpException("Extracción de plantilla falló", rc);
            var outFmd = new byte[fmdSize];
            Array.Copy(fmd, outFmd, (int)fmdSize);
            return outFmd;
        }

        // Heurística simple de calidad: un FMD válido con más minucias (mayor tamaño) es mejor.
        // El 4500 da FMDs típicos de 300-700B; normalizamos a 0-100.
        static int EstimarCalidad(byte[] fmd)
        {
            if (fmd == null || fmd.Length < 50) return 0;
            int q = 40 + (fmd.Length - 200) / 8; // ~200B → 40, ~700B → ~100
            return Math.Max(20, Math.Min(100, q));
        }

        // ------------------------------------------------------------------
        // Comparar 1:1 (verificar). Devuelve score de DISIMILITUD.
        // ------------------------------------------------------------------
        public static uint Comparar(byte[] fmdA, byte[] fmdB)
        {
            uint score = 0;
            int rc = dpfj_compare(DPFJ_FMD_ANSI_378_2004, fmdA, (uint)fmdA.Length, 0,
                                  DPFJ_FMD_ANSI_378_2004, fmdB, (uint)fmdB.Length, 0, ref score);
            if (rc != 0) throw new DpException("dpfj_compare falló", rc);
            return score;
        }

        // ------------------------------------------------------------------
        // Identificar 1:N. Devuelve el índice del mejor candidato (o -1) y su score.
        // ------------------------------------------------------------------
        public static int Identificar(byte[] probe, List<byte[]> candidatos, uint umbral, out uint bestScore)
        {
            bestScore = uint.MaxValue;
            if (candidatos == null || candidatos.Count == 0) return -1;

            int n = candidatos.Count;
            var handles = new IntPtr[n];
            var sizes = new uint[n];
            try
            {
                for (int i = 0; i < n; i++)
                {
                    handles[i] = Marshal.AllocHGlobal(candidatos[i].Length);
                    Marshal.Copy(candidatos[i], 0, handles[i], candidatos[i].Length);
                    sizes[i] = (uint)candidatos[i].Length;
                }
                uint candCnt = 1;                       // pedimos el mejor
                var outCands = new DPFJ_CANDIDATE[n];
                int rc = dpfj_identify(DPFJ_FMD_ANSI_378_2004, probe, (uint)probe.Length, 0,
                    DPFJ_FMD_ANSI_378_2004, (uint)n, handles, sizes, umbral, ref candCnt, outCands);
                if (rc != 0) throw new DpException("dpfj_identify falló", rc);
                if (candCnt == 0) return -1;            // ninguno bajo el umbral

                int idx = (int)outCands[0].fmd_idx;
                // Recuperar el score exacto del ganador con un compare directo (identify no lo expone).
                bestScore = Comparar(probe, candidatos[idx]);
                return idx;
            }
            finally { for (int i = 0; i < n; i++) if (handles[i] != IntPtr.Zero) Marshal.FreeHGlobal(handles[i]); }
        }

        // ------------------------------------------------------------------
        // Enroll multi-captura: captura N muestras y consolida en 1 plantilla robusta.
        // onProgreso(muestraActual, total, calidad) para el stream SSE.
        // ------------------------------------------------------------------
        public static Muestra CapturarEnroll(int muestras, uint timeoutMsPorMuestra, Action<int, int, int> onEsperando, Action<int, int, int> onMuestraOk, Func<bool> cancelado)
        {
            EnsureInit();
            // Estrategia: capturar N muestras en formato ANSI y quedarnos con la de
            // MEJOR calidad como plantilla. El header del SDK confirma que "For
            // ANSI/ISO formats, the enrollment FMD is a standard FMD (the same as
            // an FMD generated by the extraction function)" — es decir, una FMD
            // ANSI extraída sirve DIRECTAMENTE como plantilla para dpfj_compare
            // (validado en el spike: score 0 con el mismo dedo). Evitamos el
            // enrollment API con formato propietario DP_*_FEATURES, que daba
            // MORE_DATA no convergente al mezclar con FMDs ANSI.
            byte[] mejorFmd = null;
            int mejorCalidad = -1;
            int capturasHechas = 0;
            int intentos = 0;
            int maxIntentos = muestras + 4; // margen para recapturas de baja calidad

            while (capturasHechas < muestras && intentos < maxIntentos)
            {
                intentos++;
                if (cancelado != null && cancelado()) throw new DpException("Cancelado", 0);
                if (onEsperando != null) onEsperando(capturasHechas + 1, muestras, 0);

                Muestra m;
                try { m = CapturarMuestra(timeoutMsPorMuestra); }
                catch (CalidadException) { continue; }   // muestra mala → reintentar sin contar

                capturasHechas++;
                if (m.Calidad > mejorCalidad) { mejorCalidad = m.Calidad; mejorFmd = m.Fmd; }
                if (onMuestraOk != null) onMuestraOk(capturasHechas, muestras, m.Calidad);
            }

            if (mejorFmd == null)
                throw new DpException("No se obtuvo ninguna captura válida, reintenta", 0);

            return new Muestra { Fmd = mejorFmd, Calidad = mejorCalidad };
        }
    }
}
