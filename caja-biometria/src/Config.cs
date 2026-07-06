// ============================================================================
// Ferremex — Configuración del servicio de huella.
// Se lee de appsettings.json (junto al .exe). Valores por defecto seguros si falta.
// ============================================================================
using System;
using System.Collections.Generic;
using System.IO;

namespace Ferremex.Biometria
{
    public class Config
    {
        public const string Version = "1.0.0";

        public int Puerto = 52700;
        public uint TimeoutMs = 15000;           // espera de dedo por captura
        public int MuestrasEnroll = 4;           // capturas para consolidar una plantilla robusta

        // Umbrales de DISIMILITUD (score <= umbral = match). Derivados de FAR:
        // umbral = DPFJ_PROBABILITY_ONE (0x7FFFFFFF ≈ 2.147e9) * FAR_objetivo.
        public uint UmbralEmpleado = 2147;       // FAR 1e-6 (estricto — autoriza dinero/permisos)
        public uint UmbralCliente = 21474;       // FAR 1e-5 (canje de puntos — menos crítico)

        public static Config Cargar(string ruta)
        {
            var cfg = new Config();
            try
            {
                if (File.Exists(ruta))
                {
                    var d = JsonIn.Parse(File.ReadAllText(ruta));
                    cfg.Puerto = JsonIn.GetInt(d, "puerto", cfg.Puerto);
                    cfg.TimeoutMs = JsonIn.GetUint(d, "timeout_ms", cfg.TimeoutMs);
                    cfg.MuestrasEnroll = JsonIn.GetInt(d, "muestras_enroll", cfg.MuestrasEnroll);
                    cfg.UmbralEmpleado = JsonIn.GetUint(d, "umbral_empleado", cfg.UmbralEmpleado);
                    cfg.UmbralCliente = JsonIn.GetUint(d, "umbral_cliente", cfg.UmbralCliente);
                    Log.Info("Config cargada de " + ruta);
                }
                else Log.Info("No hay appsettings.json; usando valores por defecto.");
            }
            catch (Exception ex) { Log.Error("Error leyendo config, usando defaults: " + ex.Message); }
            return cfg;
        }
    }
}
