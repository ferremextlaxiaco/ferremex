# Acceso Remoto — Ferremex

Documentación de la configuración de acceso remoto a la Matriz desde cualquier lugar.

---

## Dispositivos

| Dispositivo | Nombre en Tailscale | IP Tailscale | Sistema |
|---|---|---|---|
| **Matriz (PC del negocio)** | administrador | `100.102.72.105` | Windows 11 |
| **Laptop de Andrés** | MacBook Pro de Andrés | `100.96.239.43` | macOS |

---

## Acceso al sistema desde cualquier lugar

Con Tailscale activo en ambos dispositivos:

| Pantalla | URL |
|---|---|
| POS (cajas) | https://100.102.72.105:7002/pos/ |
| Admin login | http://100.102.72.105:9000/login |
| Panel de órdenes | http://100.102.72.105:9000/orders |
| Ajuste de inventario | Admin → Ajuste de Inventario |

> **El POS usa HTTPS** (certificado local de mkcert). El Admin/API (puerto 9000) sigue en HTTP.
> Si un dispositivo muestra "Tu conexión no es privada" en el POS, hay que confiar la CA
> raíz de mkcert en ese dispositivo (ver `MEMORIA_INSTALACIÓN.md` → "Instalar CA de mkcert").

---

## Herramientas instaladas

### Tailscale (VPN)
- Crea un túnel seguro entre dispositivos sin configurar el router
- Instalado en la Matriz y en el MacBook
- Cuenta: `orcasystems2908@gmail.com`
- Dashboard: https://login.tailscale.com/admin/machines
- **Debe estar activo (Connected) en ambos dispositivos para acceder remotamente**

### OpenSSH Server (en la Matriz)
- Permite conexión SSH desde el Mac para editar código
- Puerto: 22
- Inicio automático: activado (StartupType = Automatic)
- Shell configurado: PowerShell

### Reglas de firewall abiertas en la Matriz

| Regla | Puerto | Propósito |
|---|---|---|
| Ferremex-API-9000 | 9000 | API + Panel Admin |
| Ferremex-POS-3000 | 3000 | (legacy) |
| Ferremex-POS-7002 | 7002 | POS de mostrador |
| Ferremex-SSH-22 | 22 | Acceso SSH remoto |

---

## Configuración SSH en el MacBook

Archivo `~/.ssh/config`:
```
Host ferremex
  HostName 100.102.72.105
  User andre
  IdentityFile ~/.ssh/ferremex
```

Llave SSH: `~/.ssh/ferremex` (ED25519)
Llave pública instalada en: `C:\Users\andre\.ssh\authorized_keys`

### Conectar por terminal
```bash
ssh ferremex
```

### Conectar con VS Code (editar código)
1. Abrir VS Code en el Mac
2. `Cmd+Shift+P` → `Remote-SSH: Connect to Host`
3. Seleccionar **ferremex**
4. Abrir carpeta `C:\ferremex`

---

## Flujo de trabajo remoto

```
1. Activar Tailscale en el Mac (ícono en la barra de menú → Connected)
2. Abrir Chrome → https://100.102.72.105:7002/pos/  (ver POS en vivo)
3. Abrir VS Code → Remote SSH → ferremex → C:\ferremex  (editar código)
4. Los cambios en archivos .tsx se recargan solos en Chrome (hot reload)
5. Los cambios en el API tardan ~5 segundos en aplicarse (Medusa watch mode)
```

---

## Solución de problemas

### "No puedo acceder a las URLs"
- Verificar que Tailscale esté **Connected** en ambos dispositivos
- Verificar que los procesos PM2 estén corriendo en la Matriz: `pm2 status`

### "SSH no conecta"
- Verificar que Tailscale esté activo
- Verificar que el servicio SSH esté corriendo en la Matriz:
  ```powershell
  Get-Service sshd
  ```
- Si está detenido: `Start-Service sshd`

### "Tailscale desconectado en la Matriz"
- En la Matriz, abrir Tailscale desde la bandeja del sistema y reconectar
- O desde PowerShell: ejecutar la app de Tailscale

---

## Configuración del sshd_config (C:\ProgramData\ssh\sshd_config)

Cambios aplicados respecto al default:
- `PasswordAuthentication yes` — habilitado explícitamente
- `Match Group administrators` — bloque comentado (usa authorized_keys del usuario)
- `DefaultShell` en registro: `powershell.exe`

---

## Notas

- Tailscale es **gratuito** hasta 3 usuarios y 100 dispositivos
- La IP Tailscale de la Matriz (`100.102.72.105`) es **estable** — no cambia
- El cajón de dinero y la impresora térmica **no funcionan en remoto** (requieren conexión física USB/RJ11)
- Claude Code se puede usar remotamente desde la terminal SSH de VS Code
