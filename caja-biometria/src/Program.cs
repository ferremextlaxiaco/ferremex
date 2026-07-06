// ============================================================================
// Ferremex — FerremexBiometriaService
// Servicio local por caja que envuelve el lector de huella DigitalPersona 4500
// (motor nativo dpfj/dpfpdd) y lo expone por HTTP en 127.0.0.1:52700 para el POS.
//
// Arranque: se lanza como tarea programada al iniciar sesión (ver caja-biometria/).
// Requiere: DigitalPersona Runtime 3.5 + driver 4500 + lector conectado.
// ============================================================================
using System;
using System.IO;
using System.Reflection;

namespace Ferremex.Biometria
{
    class Program
    {
        static int Main(string[] args)
        {
            string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            Log.Init(exeDir);
            Log.Info("=== FerremexBiometriaService v" + Config.Version + " arrancando ===");

            var cfg = Config.Cargar(Path.Combine(exeDir, "appsettings.json"));

            // Sondeo inicial del lector (informativo; el servicio arranca igual si no hay lector).
            try
            {
                string nombre = Dpfj.GetReaderName();
                if (nombre != null) Log.Info("Lector detectado: " + nombre);
                else Log.Info("ADVERTENCIA: no se detectó lector al arrancar (se reintenta por request).");
            }
            catch (Exception ex) { Log.Error("Sondeo inicial del lector falló: " + ex.Message); }

            try
            {
                var server = new Server(cfg);
                server.Start(); // bloquea
                return 0;
            }
            catch (Exception ex)
            {
                Log.Error("El servidor no pudo arrancar: " + ex.Message);
                // Causa típica: puerto ocupado o falta permiso de URL reservation en 127.0.0.1.
                Log.Error("Si es 'Access denied', corre una vez como admin o usa netsh http add urlacl.");
                return 1;
            }
        }
    }
}
