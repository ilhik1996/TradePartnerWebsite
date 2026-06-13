/**
 * Email module — transactional emails via Resend (primary) or SMTP fallback.
 *
 * To enable:
 *   npm install resend
 *   Set RESEND_API_KEY=re_...
 *   Set EMAIL_FROM=noreply@viona.app
 *
 * Without RESEND_API_KEY: logs emails to console (dev mode).
 */

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "VIONA <noreply@viona.app>";

  if (!apiKey) {
    // Dev: log to console
    console.log(`[Email] TO: ${payload.to} | SUBJECT: ${payload.subject}`);
    return true;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: payload.to, subject: payload.subject, html: payload.html, text: payload.text }),
    });
    return res.ok;
  } catch (err) {
    console.error("[Email] Send error:", err);
    return false;
  }
}

// ─── Shared layout ────────────────────────────────────────────────────────────

function layout(content: string, preheader = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIONA</title>
  <style>
    body { margin: 0; padding: 0; background: #0d1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #f0f6fc; }
    .container { max-width: 540px; margin: 0 auto; padding: 40px 24px; }
    .logo { font-size: 24px; font-weight: 900; color: #8b5cf6; letter-spacing: -0.04em; margin-bottom: 32px; }
    .card { background: #161b22; border: 1px solid #21262d; border-radius: 16px; padding: 32px; margin-bottom: 24px; }
    .big-number { font-size: 48px; font-weight: 900; background: linear-gradient(135deg, #8b5cf6, #2dd4bf); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .btn { display: inline-block; background: #8b5cf6; color: #fff; padding: 14px 32px; border-radius: 14px; text-decoration: none; font-weight: 700; font-size: 15px; }
    .muted { color: #8b949e; font-size: 13px; line-height: 1.6; }
    .divider { border: none; border-top: 1px solid #21262d; margin: 24px 0; }
    h2 { font-size: 22px; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.02em; }
    p { line-height: 1.6; margin: 0 0 16px; }
  </style>
</head>
<body>
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <div class="container">
    <div class="logo">VIONA</div>
    ${content}
    <p class="muted">You're receiving this because you have an account at VIONA. To unsubscribe from marketing emails, <a href="#" style="color:#8b5cf6;">click here</a>. Transactional emails cannot be unsubscribed.</p>
  </div>
</body>
</html>`;
}

// ─── Email templates ──────────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, firstName?: string) {
  const name = firstName ?? "there";
  return sendEmail({
    to,
    subject: "Welcome to VIONA — your daily draw awaits",
    text: `Hi ${name}! Welcome to VIONA. Daily draws in your local currency. May the odds be with you.`,
    html: layout(`
      <div class="card">
        <h2>Welcome to VIONA, ${name}!</h2>
        <p>You're now part of a daily draw community. Every day, a prize pool forms in your country's currency — and one lucky person takes home 50% of it.</p>
        <p>Your first free entry is ready. No card needed.</p>
        <a class="btn" href="${process.env.APP_URL ?? "https://viona.app"}/dashboard">Enter today's draw</a>
      </div>
      <div class="card">
        <p class="muted"><strong style="color:#f0f6fc;">How it works:</strong><br/>
        1. Each day, a prize pool forms from paid entries.<br/>
        2. You can enter paid (balance needed) or free (no payment).<br/>
        3. At draw time, a provably fair RNG picks the winner.<br/>
        4. Prize lands in your balance instantly.</p>
      </div>
    `, `Welcome to VIONA — your first draw is waiting`),
  });
}

export async function sendDrawResultEmail(opts: {
  to: string;
  firstName?: string;
  drawDate: string;
  isWinner: boolean;
  prizeAmount?: string;
  currencySymbol?: string;
  myTicket?: number;
  winnerTicket?: number;
  totalEntries?: number;
}) {
  const { to, firstName, drawDate, isWinner, prizeAmount, currencySymbol = "", myTicket, winnerTicket, totalEntries } = opts;
  const name = firstName ?? "there";

  if (isWinner) {
    return sendEmail({
      to,
      subject: `You won ${currencySymbol}${prizeAmount}! 🎉`,
      text: `Congratulations ${name}! You won ${currencySymbol}${prizeAmount} in the ${drawDate} draw. The prize is in your VIONA balance.`,
      html: layout(`
        <div class="card" style="border-color:#f59e0b33;">
          <p style="font-size:36px;margin:0 0 8px;">🏆</p>
          <h2>You won, ${name}!</h2>
          <p>You hit the jackpot in the <strong>${drawDate}</strong> draw.</p>
          <div class="big-number">${currencySymbol}${prizeAmount}</div>
          <p style="margin-top:16px;">The prize has been added to your balance. You can withdraw it or use it to enter future draws.</p>
          <a class="btn" href="${process.env.APP_URL ?? "https://viona.app"}/wallet" style="margin-top:8px;display:inline-block;">View balance</a>
        </div>
      `, `You won ${currencySymbol}${prizeAmount} in today's VIONA draw!`),
    });
  }

  const proximity = myTicket && winnerTicket && totalEntries
    ? Math.max(0, 100 - Math.round((Math.abs(myTicket - winnerTicket) / totalEntries) * 100))
    : null;

  return sendEmail({
    to,
    subject: `Draw result for ${drawDate}`,
    text: `Hi ${name}. The ${drawDate} draw has completed. ${proximity !== null ? `Your proximity score: ${proximity}%.` : ""} Better luck tomorrow!`,
    html: layout(`
      <div class="card">
        <h2>Draw result — ${drawDate}</h2>
        <p>Today's draw has been completed. The prize went to another lucky player.</p>
        ${proximity !== null ? `
        <p>Your proximity to the winning ticket: <strong style="color:#8b5cf6;">${proximity}%</strong></p>
        <div style="background:#0d1117;border-radius:8px;height:8px;overflow:hidden;margin:8px 0 16px;">
          <div style="background:linear-gradient(90deg,#8b5cf6,#2dd4bf);height:100%;width:${proximity}%;border-radius:8px;"></div>
        </div>` : ""}
        <p class="muted">Come back tomorrow — the pool resets and everyone gets a fresh chance.</p>
        <a class="btn" href="${process.env.APP_URL ?? "https://viona.app"}/dashboard">Enter tomorrow's draw</a>
      </div>
    `, `Draw completed — see how close you were`),
  });
}

export async function sendWithdrawalConfirmationEmail(to: string, amount: string, currency: string) {
  return sendEmail({
    to,
    subject: `Withdrawal of ${currency} ${amount} requested`,
    text: `Your withdrawal request for ${currency} ${amount} has been received. It will be processed within 3 business days.`,
    html: layout(`
      <div class="card">
        <h2>Withdrawal requested</h2>
        <div class="big-number">${currency} ${amount}</div>
        <p style="margin-top:16px;">Your withdrawal request has been received and will be processed within <strong>3 business days</strong>.</p>
        <p class="muted">If you didn't make this request, please contact support immediately.</p>
      </div>
    `),
  });
}

export async function sendLowBalanceEmail(to: string, currencySymbol: string, entryAmount: string) {
  return sendEmail({
    to,
    subject: "Your VIONA balance is low",
    text: `Your balance is below ${currencySymbol}${entryAmount}. Top up to keep participating in daily draws.`,
    html: layout(`
      <div class="card">
        <h2>Balance running low</h2>
        <p>Your current balance is below the daily entry amount of <strong>${currencySymbol}${entryAmount}</strong>. You won't be automatically entered in today's draw.</p>
        <p>Top up your balance to stay in the game. Or use a free entry — no payment required.</p>
        <a class="btn" href="${process.env.APP_URL ?? "https://viona.app"}/wallet">Top up now</a>
      </div>
    `, `Top up your balance to enter today's draw`),
  });
}
