import { env, features } from "../config/env";

interface L {
  ru?: string;
  en?: string;
  vi?: string;
}

/** Kitchen-facing label: Russian first, then Vietnamese, then English. */
const label = (v: L | null | undefined): string => v?.ru || v?.vi || v?.en || "";

interface NotifiableItem {
  name: L;
  variantName?: L | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note?: string;
}

interface NotifiableOrder {
  _id: unknown;
  orderNumber: number;
  table: { label: string; type: string };
  customer?: { name?: string; phone?: string };
  items: NotifiableItem[];
  note?: string;
  total: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatRub(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

function buildMessage(order: NotifiableOrder): string {
  const lines: string[] = [];
  const vip = order.table.type === "vip" ? " ⭐ VIP" : "";
  lines.push(`🍲 <b>Новый заказ #${order.orderNumber}</b>`);
  lines.push(`🪑 Стол: <b>${escapeHtml(order.table.label)}</b>${vip}`);

  const name = order.customer?.name?.trim();
  const phone = order.customer?.phone?.trim();
  if (name || phone) {
    lines.push(
      `👤 ${escapeHtml([name, phone].filter(Boolean).join(" · "))}`,
    );
  }

  lines.push("");
  for (const item of order.items) {
    const variant = label(item.variantName);
    const title = escapeHtml(label(item.name));
    const suffix = variant ? ` (${escapeHtml(variant)})` : "";
    lines.push(`• ${item.quantity}× ${title}${suffix} — ${formatRub(item.lineTotal)}`);
    if (item.note?.trim()) lines.push(`   ✏️ ${escapeHtml(item.note.trim())}`);
  }

  if (order.note?.trim()) {
    lines.push("");
    lines.push(`📝 ${escapeHtml(order.note.trim())}`);
  }

  lines.push("");
  lines.push(`💰 <b>Итого: ${formatRub(order.total)}</b>`);
  lines.push(`🔗 ${env.FRONTEND_URL}/orders/${String(order._id)}`);

  return lines.join("\n");
}

/**
 * Post an order to the kitchen group. Fire-and-forget: failures are logged but
 * never propagate — a Telegram outage must not block order creation.
 */
export async function sendOrderNotification(order: NotifiableOrder): Promise<void> {
  if (!features.telegram) {
    console.warn("[telegram] not configured — skipping notification");
    return;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: buildMessage(order),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      console.error("[telegram] sendMessage failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[telegram] sendMessage error:", (err as Error).message);
  }
}
