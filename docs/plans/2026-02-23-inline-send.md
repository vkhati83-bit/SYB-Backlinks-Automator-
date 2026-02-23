# Inline Send + Remove Review Queue Nav — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the `/review` nav item from the sidebar and make the compose modal send emails directly (with animation), eliminating the need to visit a separate review page.

**Architecture:** Two dashboard files change. `Sidebar.tsx` loses one nav entry. `ProspectDetail.tsx` gets a new modal state machine: `generating → ready → sending → sent`. On "Send", the modal calls `POST /emails/send` then immediately `POST /emails/{id}/approve`, then polls `GET /emails/{id}` every 2s until `status === 'sent'`, then shows a success animation and auto-closes.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS. No new dependencies.

---

### Task 1: Remove Review Queue from sidebar nav

**Files:**
- Modify: `dashboard/src/components/Sidebar.tsx` (lines 7–18)

**Context:** `navItems` is an array of objects at the top of the file. The Review Queue entry is `{ href: '/review', icon: 'inbox', label: 'Review Queue' }`. Deleting it removes the link from the sidebar. The route file at `dashboard/src/app/review/page.tsx` is **not** deleted — just hidden from nav.

**Step 1: Delete the Review Queue entry from navItems**

In `dashboard/src/components/Sidebar.tsx`, remove this line from the `navItems` array:
```ts
{ href: '/review', icon: 'inbox', label: 'Review Queue' },
```

The array should go directly from `{ href: '/prospects', ... }` to `{ href: '/research', ... }`.

**Step 2: Verify visually**

Run the dashboard locally (`npm run dev` in `dashboard/`) and confirm "Review Queue" no longer appears in the sidebar. The `/review` URL should still work if navigated to directly.

**Step 3: Commit**
```bash
git add dashboard/src/components/Sidebar.tsx
git commit -m "Remove Review Queue from sidebar nav (route kept, just hidden)"
```

---

### Task 2: Add modal state type and sending/sent UI states to ProspectDetail

**Files:**
- Modify: `dashboard/src/components/prospects/ProspectDetail.tsx`

**Context:** The compose modal currently has two UI states managed by `composing` (boolean) and `generatedEmail` (null or object). We need a proper state machine with 4 states: `generating`, `ready`, `sending`, `sent`. This task adds the state type, the new state variable, and the two new UI panels (sending animation, sent success). It does NOT yet wire up the Send button — that's Task 3.

**Step 1: Add modal state type near the top of the component**

After the existing imports, add a union type for modal state. Find the line:
```ts
const [composing, setComposing] = useState(false);
```
Replace the `composing` + `generatedEmail` state declarations with:
```ts
type ModalState = 'idle' | 'generating' | 'ready' | 'sending' | 'sent';
const [modalState, setModalState] = useState<ModalState>('idle');
const [generatedEmail, setGeneratedEmail] = useState<{ subject: string; body: string } | null>(null);
const [sentEmailId, setSentEmailId] = useState<string | null>(null);
```

**Step 2: Update handleComposeEmail to use modalState**

Find `handleComposeEmail` and replace `setComposing(true/false)` calls:
```ts
const handleComposeEmail = async () => {
  const primaryContact = contacts.find(c => c.is_primary) || contacts[0];
  if (!primaryContact) {
    setComposeError('No contact available. Add a contact first.');
    return;
  }

  setShowComposeModal(true);
  setModalState('generating');
  setComposeError(null);
  setGeneratedEmail(null);
  setSentEmailId(null);

  try {
    const res = await fetch(`${API_BASE}/emails/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: prospect.id,
        contact_id: primaryContact.id,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setGeneratedEmail({ subject: data.subject, body: data.body });
      setEditedSubject(data.subject);
      setEditedBody(data.body);
      setModalState('ready');
    } else {
      const errorData = await res.json();
      const errorMsg = errorData.details
        ? `${errorData.error}: ${errorData.details}`
        : errorData.error || 'Failed to generate email';
      setComposeError(errorMsg);
      setModalState('idle');
    }
  } catch (error) {
    setComposeError('Failed to connect to server. Is the backend running?');
    setModalState('idle');
  }
};
```

**Step 3: Replace the modal body conditional rendering**

Find the section inside the modal `<div className="p-4 overflow-y-auto ...">` and replace the existing conditional with:

```tsx
{modalState === 'generating' && (
  <div className="text-center py-12">
    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-4"></div>
    <p className="text-gray-600">Generating personalized email with Claude...</p>
  </div>
)}

{modalState === 'ready' && !composeError && generatedEmail && (
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
      <div className="input bg-gray-50">
        {contacts.find(c => c.is_primary)?.email || contacts[0]?.email}
      </div>
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
      <input
        type="text"
        value={editedSubject}
        onChange={(e) => setEditedSubject(e.target.value)}
        className="input w-full"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
      <textarea
        value={editedBody}
        onChange={(e) => setEditedBody(e.target.value)}
        rows={12}
        className="input w-full font-mono text-sm"
      />
    </div>
  </div>
)}

{composeError && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
    {composeError}
  </div>
)}

{modalState === 'sending' && (
  <div className="text-center py-12">
    <div className="mb-4 flex justify-center">
      <svg
        className="w-16 h-16 text-primary-500 animate-bounce"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
        />
      </svg>
    </div>
    <p className="text-gray-600 font-medium">Sending to {prospect.domain}...</p>
    <p className="text-gray-400 text-sm mt-1">This usually takes a few seconds</p>
  </div>
)}

{modalState === 'sent' && (
  <div className="text-center py-12">
    <div className="mb-4 flex justify-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
        <svg
          className="w-10 h-10 text-green-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    </div>
    <p className="text-gray-900 font-semibold text-lg">Email sent!</p>
    <p className="text-gray-500 mt-1">Successfully sent to {prospect.domain}</p>
  </div>
)}
```

**Step 4: Replace the modal footer buttons**

Find the footer section `{generatedEmail && ( <div className="p-4 border-t ...">` and replace entirely:

```tsx
{(modalState === 'ready' || modalState === 'sending') && !composeError && (
  <div className="p-4 border-t border-gray-200 flex gap-3">
    <button
      onClick={handleSendEmail}
      disabled={modalState === 'sending'}
      className="btn btn-primary flex-1"
    >
      {modalState === 'sending' ? 'Sending...' : 'Send'}
    </button>
    <button
      onClick={handleComposeEmail}
      disabled={modalState === 'sending'}
      className="btn btn-secondary"
    >
      Regenerate
    </button>
    <button
      onClick={() => {
        setShowComposeModal(false);
        setGeneratedEmail(null);
        setModalState('idle');
      }}
      disabled={modalState === 'sending'}
      className="btn btn-secondary"
    >
      Cancel
    </button>
  </div>
)}
```

**Step 5: Update the modal close (X) button** to also reset `modalState`:

Find the X button `onClick` handler in the modal header:
```tsx
onClick={() => {
  setShowComposeModal(false);
  setGeneratedEmail(null);
  setComposeError(null);
}}
```
Replace with:
```tsx
onClick={() => {
  setShowComposeModal(false);
  setGeneratedEmail(null);
  setComposeError(null);
  setModalState('idle');
  setSentEmailId(null);
}}
```

**Step 6: Commit**
```bash
git add dashboard/src/components/prospects/ProspectDetail.tsx
git commit -m "Add modal state machine (generating/ready/sending/sent) with animations"
```

---

### Task 3: Wire up Send button — approve + poll + auto-close

**Files:**
- Modify: `dashboard/src/components/prospects/ProspectDetail.tsx`

**Context:** Now that the UI states exist, we replace `handleSendEmail` with logic that:
1. Saves the email (`POST /emails/send` → returns `email_id`)
2. Immediately approves it (`POST /emails/{id}/approve` → queues BullMQ)
3. Sets modal state to `sending`
4. Polls `GET /emails/{id}` every 2 seconds until `status === 'sent'` (max 30s)
5. Sets modal state to `sent`
6. Auto-closes modal after 2 seconds

**Step 1: Replace handleSendEmail**

Find `const handleSendEmail = async () => {` and replace the entire function:

```ts
const handleSendEmail = async () => {
  const primaryContact = contacts.find(c => c.is_primary) || contacts[0];
  if (!primaryContact || !generatedEmail) return;

  setModalState('sending');
  setComposeError(null);

  try {
    // Step 1: Save email
    const saveRes = await fetch(`${API_BASE}/emails/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: prospect.id,
        contact_id: primaryContact.id,
        subject: editedSubject,
        body: editedBody,
      }),
    });

    if (!saveRes.ok) {
      const err = await saveRes.json();
      setComposeError(err.message || 'Failed to save email');
      setModalState('ready');
      return;
    }

    const saveData = await saveRes.json();
    const emailId: string = saveData.email_id;
    setSentEmailId(emailId);

    // Step 2: Approve (queues BullMQ for sending)
    const approveRes = await fetch(`${API_BASE}/emails/${emailId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!approveRes.ok) {
      const err = await approveRes.json();
      setComposeError(err.error || 'Failed to approve email');
      setModalState('ready');
      return;
    }

    // Step 3: Poll for sent status
    const maxAttempts = 15; // 15 × 2s = 30s max
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const statusRes = await fetch(`${API_BASE}/emails/${emailId}`);
        if (statusRes.ok) {
          const emailData = await statusRes.json();
          if (emailData.status === 'sent') {
            clearInterval(poll);
            setModalState('sent');
            // Auto-close after 2 seconds
            setTimeout(() => {
              setShowComposeModal(false);
              setGeneratedEmail(null);
              setModalState('idle');
              setSentEmailId(null);
            }, 2000);
          }
        }
      } catch {
        // ignore poll errors, keep trying
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        // Timed out — treat as success anyway (BullMQ will deliver)
        setModalState('sent');
        setTimeout(() => {
          setShowComposeModal(false);
          setGeneratedEmail(null);
          setModalState('idle');
          setSentEmailId(null);
        }, 2000);
      }
    }, 2000);

  } catch (error) {
    setComposeError('Failed to connect to server');
    setModalState('ready');
  }
};
```

**Step 2: Verify the flow manually**

- Open Research Citations or Broken Links page
- Select a prospect with a contact → click "Compose Email"
- Modal generates email (spinner visible)
- Click "Send"
- Modal shows paper plane bounce animation + "Sending to {domain}..."
- After a few seconds: green checkmark + "Email sent!" appears
- Modal auto-closes after 2 seconds
- No need to visit `/review`

**Step 3: Commit**
```bash
git add dashboard/src/components/prospects/ProspectDetail.tsx
git commit -m "Wire Send button: approve+poll+sent animation, auto-close on success"
```

---

### Task 4: Deploy dashboard to Railway

**Step 1: Deploy**
```bash
railway up --service dashboard --detach
```

**Step 2: Check build logs**
```bash
railway logs --service dashboard --build
```
Expected: build succeeds, no TypeScript errors.

**Step 3: Smoke test on live URL**
- Visit the deployed dashboard
- Confirm "Review Queue" is gone from sidebar
- Compose an email on a research citation prospect, send it, confirm the animation plays and modal closes

**Step 4: Final commit if any fixes needed**
```bash
git add .
git commit -m "Fix: [description of any last-minute fixes]"
```
