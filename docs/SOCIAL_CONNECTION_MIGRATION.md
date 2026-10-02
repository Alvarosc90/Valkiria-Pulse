# Migrating validated social connections into PULSE

The Instagram, TikTok and LinkedIn integrations that were proven manually should be moved into PULSE without copying secrets into source code.

## Process

1. Rotate any token that was exposed during manual testing.
2. Configure `CREDENTIALS_ENCRYPTION_KEY` in the PULSE runtime.
3. Run the secure account import CLI with secrets supplied as environment variables.
4. The CLI stores encrypted tokens only and prints no credential values.
5. Confirm the account appears in `GET /api/v1/social-accounts`.

## Metadata examples

Instagram metadata:
`{"instagramUserId":"..."}`

TikTok metadata:
`{"sandbox":true}` during sandbox validation.

LinkedIn personal metadata:
`{"authorUrn":"urn:li:person:..."}`

LinkedIn organization metadata:
`{"authorUrn":"urn:li:organization:..."}`

Organization publishing must only be enabled after the required LinkedIn product permissions are approved.
