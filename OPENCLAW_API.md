# OpenClaw Smart Mirror HTTP API Integration Guide

This guide explains how to send messages, notifications, and assistant responses from **OpenClaw** to the Smart Mirror display.

## HTTP API Server details
- **URL**: `http://127.0.0.1:18080/api/message`
- **Method**: `POST`
- **Content-Type**: `application/json`

> [!WARNING]
> The API server is built into the Electron wrapper. You **MUST** run the project using `npm run electron:dev` (not `npm run dev`) for the API server on port `18080` to start up.

---

## Payload Format

The POST request accepts a JSON object with the following fields:

| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `text` | `string` | The text content to be displayed on the screen. Supports HTML/Formatting tags (e.g. `<br>`). | **Yes** |
| `title` | `string` | An optional title/header for the card display (e.g., "OpenClaw Assistant"). | No |
| `type` | `string` | The style variant of the message card. Options: `"assistant"`, `"info"`, `"success"`, `"warning"`, `"error"`. Default is `"assistant"`. | No |
| `duration` | `number` | Time in milliseconds to show the message before auto-fading. Use `0` or `null` to keep the message visible indefinitely. Default is `7000` (7 seconds). | No |
| `image` | `string` | Optional image URL, base64 encoded image string, or local path to display next to the message. | No |

---

## Examples

### 1. Simple Assistant Response
Show what the voice assistant has spoken to the user.

```bash
curl -X POST http://127.0.0.1:18080/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "title": "OpenClaw",
    "text": "Merhaba Burak! Bugün senin için ne yapabilirim?",
    "type": "assistant",
    "duration": 6000
  }'
```

### 2. Success Status Notification
Can be used when a command has executed successfully.

```bash
curl -X POST http://127.0.0.1:18080/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sistem Güncellemesi",
    "text": "Tüm akıllı ev modülleri başarıyla senkronize edildi.",
    "type": "success",
    "duration": 5000
  }'
```

### 3. Warning Alert
Display temporary system warnings or sensor status changes.

```bash
curl -X POST http://127.0.0.1:18080/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Cihaz Uyarısı",
    "text": "Oturma odası hava kalitesi düştü. Havalandırmayı açmak ister misiniz?",
    "type": "warning",
    "duration": 10000
  }'
```

### 4. Persistent Message (Requires manual dismissal/overwrite)
Show a message on the screen indefinitely (until a new message overwrites it or the app restarts).

```bash
curl -X POST http://127.0.0.1:18080/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "title": "OpenClaw Dinliyor...",
    "text": "Sizi dinliyorum. Komutunuzu söyleyin.",
    "type": "info",
    "duration": 0
  }'
```

---

## UI Styling Characteristics
The mirror displays these alerts with premium glassmorphic cards:
- **`assistant`**: Glowing white/neon-cyan borders with a sleek voice-bubble feel.
- **`info`**: Soft blue accents.
- **`success`**: Subtle green outline with glow.
- **`warning`**: Orange alert styling.
- **`error`**: Vivid red outline to indicate failures.

---

## Testing via PowerShell (Windows)

If you are using default Windows PowerShell (5.1), the `-EnforceArray` parameter is not supported. Use the following script instead:

```powershell
$body = @{
    title    = "OpenClaw Test"
    text     = "PowerShell uzerinden akilli aynaya baglanti basariyla saglandi."
    type     = "success"
    duration = 5000
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:18080/api/message" -Method Post -Body $body -ContentType "application/json; charset=utf-8"
```
