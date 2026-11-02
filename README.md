# INK NEXT V36 — Contact form submission, reset and 3D configurator inquiry

V36 builds on V35. The original GLB and vehicle configurator code are unchanged.

## V35 problems identified

1. PREPARE EMAIL merely opened the user’s email application; it was not a website submission.
2. There was no Reset form action.
3. 3D Configurator was absent from the Interested in dropdown.
4. Errors for empty/whitespace-only inputs and delivery failures were unclear.
5. The contact modal could reopen at an unintended scroll position, partially clipping its heading.
6. The design did not disclose a third-party form-delivery provider because none was connected.

## V36 updates

- Submit inquiry now uses the AJAX endpoint at `https://formsubmit.co/ajax/sales@ink-next.com`.
- Clear validation and an optional consent checkbox required for submitting to the third-party provider.
- Reset Form clears name, email, service, project details, consent and feedback.
- Interested in now includes **3D Configurator**.
- Submitting shows an in-progress state, prevents duplicate clicks, checks the provider's actual `success` result (including string `"false"`), handles network errors, and does not announce email delivery without activation.
- The contact modal starts at the top on opening; heading sizing, input alignment and responsive controls refined.

## IMPORTANT — REQUIRED ONE-TIME EMAIL ACTIVATION

FormSubmit is **a third-party service**, not a backend owned by INK NEXT. The studio must be able to access `sales@ink-next.com`:

1. Run V36 locally or deploy it.
2. Fill out and submit one real test inquiry, after checking the privacy notice.
3. Open the activation email delivered to `sales@ink-next.com` (including Spam folder).
4. Click the activation link sent by FormSubmit.
5. Submit another test inquiry, confirm delivery at the studio inbox and test failures/resets.

Until the studio activates its inbox, requests may be accepted by the provider but **email delivery must not be assumed**. The UI states this explicitly. This service may store submissions per its own policies. See https://formsubmit.co/documentation and https://formsubmit.co/privacy.pdf. If you don't want an external service processing customer information, replace this with a first-party serverless endpoint and your chosen email provider before publishing.

## Running locally

Windows PowerShell:
```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

This project uses `public/models/car.glb`, remains manually loaded, and preserves the Low / Balanced / High options. Due to the prior repeated graphics black-screen incidents, do not run the large GLB on the affected laptop until the GPU/display issue is investigated.

## Testing

Check: valid submission (after activating email), invalid email, empty name/message, reset form, repeated clicks while sending, network error, 3D Configurator selection, and mobile/modal heading. Contact forms can be tested without loading the GLB.
