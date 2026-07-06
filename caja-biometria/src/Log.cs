// ============================================================================
// Ferremex — Log simple a consola + archivo rotativo (biometria.log junto al exe).
// ============================================================================
using System;
using System.IO;

namespace Ferremex.Biometria
{
    public static class Log
    {
        static readonly object _lock = new object();
        static string _file;

        public static void Init(string exeDir)
        {
            _file = Path.Combine(exeDir, "biometria.log");
        }

        static void Write(string nivel, string msg)
        {
            string linea = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " [" + nivel + "] " + msg;
            Console.WriteLine(linea);
            if (_file == null) return;
            try
            {
                lock (_lock)
                {
                    // Rotación básica: si supera ~2MB, renombrar a .old.
                    if (File.Exists(_file) && new FileInfo(_file).Length > 2 * 1024 * 1024)
                    {
                        string old = _file + ".old";
                        if (File.Exists(old)) File.Delete(old);
                        File.Move(_file, old);
                    }
                    File.AppendAllText(_file, linea + "\r\n");
                }
            }
            catch { /* el log no debe tumbar el servicio */ }
        }

        public static void Info(string msg) { Write("INFO", msg); }
        public static void Error(string msg) { Write("ERROR", msg); }
    }
}
