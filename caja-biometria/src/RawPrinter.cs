// ============================================================================
// Ferremex — Impresión RAW por el spooler de Windows (winspool.Drv).
//
// Por qué: la térmica USB (Sicar WL88S, VID_20D1) NO expone puerto COM — Windows
// la reclama en exclusiva como cola de impresión ("Generic / Text Only", USB001).
// Web Serial y WebUSB no pueden verla. La única vía que conserva el cajón sin
// tocar el driver es escribir los bytes ESC/POS RAW a la cola con WritePrinter.
//
// El navegador manda el ticket ya armado (ESC/POS) al servicio local por HTTP;
// aquí lo escribimos crudo a la impresora por su NOMBRE de Windows. El cajón se
// abre con el mismo comando ESC/POS [1B 70 00 19 19] enrutado por la cola RAW.
//
// Patrón RawPrinterHelper clásico de Microsoft (P/Invoke, sin dependencias).
// ============================================================================
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Ferremex.Biometria
{
    public static class RawPrinter
    {
        // -------------------------------------------------------------------
        // P/Invoke a winspool.Drv
        // -------------------------------------------------------------------
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DOCINFOW
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
        }

        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

        [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
        static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW di);

        [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
        static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
        static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
        static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
        static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

        // Enumerar impresoras
        [DllImport("winspool.Drv", EntryPoint = "EnumPrintersW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool EnumPrinters(int flags, string name, int level, IntPtr pPrinterEnum,
            int cbBuf, out int pcbNeeded, out int pcReturned);

        const int PRINTER_ENUM_LOCAL = 0x00000002;
        const int PRINTER_ENUM_CONNECTIONS = 0x00000004;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct PRINTER_INFO_4
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pPrinterName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pServerName;
            public int Attributes;
        }

        // -------------------------------------------------------------------
        // API pública
        // -------------------------------------------------------------------

        /// <summary>Lista los nombres de las impresoras instaladas en Windows.</summary>
        public static List<string> ListarImpresoras()
        {
            var lista = new List<string>();
            int flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            int needed, returned;
            // Primera llamada: averiguar el tamaño del buffer.
            EnumPrinters(flags, null, 4, IntPtr.Zero, 0, out needed, out returned);
            if (needed == 0) return lista;

            IntPtr buffer = Marshal.AllocHGlobal(needed);
            try
            {
                if (EnumPrinters(flags, null, 4, buffer, needed, out needed, out returned))
                {
                    int size = Marshal.SizeOf(typeof(PRINTER_INFO_4));
                    for (int i = 0; i < returned; i++)
                    {
                        var info = (PRINTER_INFO_4)Marshal.PtrToStructure(
                            (IntPtr)(buffer.ToInt64() + i * size), typeof(PRINTER_INFO_4));
                        if (!string.IsNullOrEmpty(info.pPrinterName)) lista.Add(info.pPrinterName);
                    }
                }
            }
            finally { Marshal.FreeHGlobal(buffer); }
            return lista;
        }

        /// <summary>
        /// Envía bytes RAW (ESC/POS) a una impresora por su nombre de Windows.
        /// Lanza Exception con mensaje claro si la impresora no existe o falla.
        /// </summary>
        public static void EnviarBytes(string nombreImpresora, byte[] datos)
        {
            if (string.IsNullOrEmpty(nombreImpresora))
                throw new Exception("Falta el nombre de la impresora.");
            if (datos == null || datos.Length == 0)
                throw new Exception("No hay datos para imprimir.");

            IntPtr hPrinter;
            if (!OpenPrinter(nombreImpresora, out hPrinter, IntPtr.Zero))
                throw new Exception("No se pudo abrir la impresora '" + nombreImpresora +
                    "' (¿existe? error " + Marshal.GetLastWin32Error() + ").");

            IntPtr pUnmanaged = IntPtr.Zero;
            try
            {
                var di = new DOCINFOW
                {
                    pDocName = "Ferremex Ticket",
                    pOutputFile = null,
                    pDatatype = "RAW", // clave: pasa los bytes sin que el driver los reinterprete
                };
                if (!StartDocPrinter(hPrinter, 1, ref di))
                    throw new Exception("StartDocPrinter falló (error " + Marshal.GetLastWin32Error() + ").");
                try
                {
                    if (!StartPagePrinter(hPrinter))
                        throw new Exception("StartPagePrinter falló (error " + Marshal.GetLastWin32Error() + ").");
                    try
                    {
                        pUnmanaged = Marshal.AllocHGlobal(datos.Length);
                        Marshal.Copy(datos, 0, pUnmanaged, datos.Length);
                        int escritos;
                        if (!WritePrinter(hPrinter, pUnmanaged, datos.Length, out escritos))
                            throw new Exception("WritePrinter falló (error " + Marshal.GetLastWin32Error() + ").");
                        if (escritos != datos.Length)
                            throw new Exception("Solo se escribieron " + escritos + " de " + datos.Length + " bytes.");
                    }
                    finally { EndPagePrinter(hPrinter); }
                }
                finally { EndDocPrinter(hPrinter); }
            }
            finally
            {
                if (pUnmanaged != IntPtr.Zero) Marshal.FreeHGlobal(pUnmanaged);
                ClosePrinter(hPrinter);
            }
        }
    }
}
