// ============================================================================
// Ferremex — Mini-helper JSON (sin dependencias externas, para mantener el .exe
// autocontenido con solo csc). Serializa/parsea lo justo para el contrato HTTP:
// objetos planos, strings, números, booleanos y arrays de objetos.
// NO es un parser JSON completo — cubre exactamente lo que los endpoints reciben.
// ============================================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Ferremex.Biometria
{
    /// <summary>Construye JSON de salida de forma segura (escapa strings).</summary>
    public class JsonOut
    {
        readonly StringBuilder _sb = new StringBuilder();
        bool _needComma;

        public JsonOut() { _sb.Append('{'); }

        void Sep() { if (_needComma) _sb.Append(','); _needComma = true; }
        static string Esc(string s)
        {
            if (s == null) return "";
            var b = new StringBuilder();
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': b.Append("\\\""); break;
                    case '\\': b.Append("\\\\"); break;
                    case '\n': b.Append("\\n"); break;
                    case '\r': b.Append("\\r"); break;
                    case '\t': b.Append("\\t"); break;
                    default:
                        if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4"));
                        else b.Append(c);
                        break;
                }
            }
            return b.ToString();
        }

        public JsonOut Str(string key, string val) { Sep(); _sb.Append('"').Append(Esc(key)).Append("\":"); if (val == null) _sb.Append("null"); else _sb.Append('"').Append(Esc(val)).Append('"'); return this; }
        public JsonOut Num(string key, long val) { Sep(); _sb.Append('"').Append(Esc(key)).Append("\":").Append(val.ToString(CultureInfo.InvariantCulture)); return this; }
        public JsonOut Bool(string key, bool val) { Sep(); _sb.Append('"').Append(Esc(key)).Append("\":").Append(val ? "true" : "false"); return this; }
        public JsonOut Null(string key) { Sep(); _sb.Append('"').Append(Esc(key)).Append("\":null"); return this; }
        public JsonOut Raw(string key, string rawJson) { Sep(); _sb.Append('"').Append(Esc(key)).Append("\":").Append(rawJson); return this; }

        public string End() { _sb.Append('}'); return _sb.ToString(); }

        /// <summary>Helper estático: objeto de error estándar { ok:false, error:{codigo,mensaje} }.</summary>
        public static string Error(string codigo, string mensaje)
        {
            return "{\"ok\":false,\"error\":{\"codigo\":\"" + Esc(codigo) + "\",\"mensaje\":\"" + Esc(mensaje) + "\"}}";
        }

        /// <summary>Devuelve un string JSON entre comillas y escapado (para arrays de strings sueltos).</summary>
        public static string QuoteString(string s)
        {
            if (s == null) return "null";
            return "\"" + Esc(s) + "\"";
        }
    }

    /// <summary>Parser JSON minimalista para los request bodies (objetos planos + arrays de objetos planos).</summary>
    public static class JsonIn
    {
        // Devuelve un diccionario con valores: string, double, bool, null, o List<Dictionary<string,object>> para arrays de objetos.
        public static Dictionary<string, object> Parse(string s)
        {
            int i = 0;
            var v = ParseValue(s, ref i);
            return v as Dictionary<string, object> ?? new Dictionary<string, object>();
        }

        static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            if (i >= s.Length) return null;
            char c = s[i];
            if (c == '{') return ParseObject(s, ref i);
            if (c == '[') return ParseArray(s, ref i);
            if (c == '"') return ParseString(s, ref i);
            if (c == 't' || c == 'f') return ParseBool(s, ref i);
            if (c == 'n') { i += 4; return null; } // null
            return ParseNumber(s, ref i);
        }

        static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++; // {
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return d; }
            while (i < s.Length)
            {
                SkipWs(s, ref i);
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ':') i++;
                object val = ParseValue(s, ref i);
                d[key] = val;
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; break; }
                break;
            }
            return d;
        }

        static List<object> ParseArray(string s, ref int i)
        {
            var list = new List<object>();
            i++; // [
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return list; }
            while (i < s.Length)
            {
                object val = ParseValue(s, ref i);
                list.Add(val);
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; break; }
                break;
            }
            return list;
        }

        static string ParseString(string s, ref int i)
        {
            var b = new StringBuilder();
            i++; // opening "
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '"') break;
                if (c == '\\' && i < s.Length)
                {
                    char e = s[i++];
                    switch (e)
                    {
                        case '"': b.Append('"'); break;
                        case '\\': b.Append('\\'); break;
                        case '/': b.Append('/'); break;
                        case 'n': b.Append('\n'); break;
                        case 'r': b.Append('\r'); break;
                        case 't': b.Append('\t'); break;
                        case 'b': b.Append('\b'); break;
                        case 'f': b.Append('\f'); break;
                        case 'u':
                            if (i + 4 <= s.Length)
                            {
                                int code = int.Parse(s.Substring(i, 4), NumberStyles.HexNumber);
                                b.Append((char)code); i += 4;
                            }
                            break;
                        default: b.Append(e); break;
                    }
                }
                else b.Append(c);
            }
            return b.ToString();
        }

        static object ParseNumber(string s, ref int i)
        {
            int start = i;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '-' || s[i] == '+' || s[i] == '.' || s[i] == 'e' || s[i] == 'E')) i++;
            double d;
            double.TryParse(s.Substring(start, i - start), NumberStyles.Any, CultureInfo.InvariantCulture, out d);
            return d;
        }

        static object ParseBool(string s, ref int i)
        {
            if (s[i] == 't') { i += 4; return true; }
            i += 5; return false;
        }

        static void SkipWs(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        // ---- Helpers de acceso tipado ----
        public static string GetStr(Dictionary<string, object> d, string key, string def = null)
        {
            object v; return (d != null && d.TryGetValue(key, out v) && v is string) ? (string)v : def;
        }
        public static int GetInt(Dictionary<string, object> d, string key, int def)
        {
            object v; if (d != null && d.TryGetValue(key, out v) && v is double) return (int)(double)v; return def;
        }
        public static uint GetUint(Dictionary<string, object> d, string key, uint def)
        {
            object v; if (d != null && d.TryGetValue(key, out v) && v is double) return (uint)(double)v; return def;
        }
        public static List<object> GetArray(Dictionary<string, object> d, string key)
        {
            object v; if (d != null && d.TryGetValue(key, out v) && v is List<object>) return (List<object>)v; return new List<object>();
        }
    }
}
