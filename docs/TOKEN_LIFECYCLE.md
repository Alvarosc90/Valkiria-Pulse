# Social token lifecycle

PULSE owns token lifecycle server-side.

## TikTok
The worker uses the OAuth refresh token before the access token expires and stores any rotated refresh token returned by TikTok.

## Instagram
Long-lived Instagram Login tokens are renewed with the Instagram refresh endpoint before expiry.

## LinkedIn
Automatic refresh is attempted only when LinkedIn issued a refresh token for the application. Apps without programmatic refresh support remain connected until the access token expires, then PULSE marks the account as expired and the UI can request reconnection.

## Security
- Refresh tokens never reach the browser.
- Tokens are decrypted only inside server-side token/provider services.
- Newly issued tokens are encrypted before being persisted.
