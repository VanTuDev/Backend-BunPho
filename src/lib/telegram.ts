import type { HydratedDocument } from "mongoose";
import { env, features } from "../config/env";
import Order, { ORDER_STATUSES, type OrderAttrs, type OrderStatus } from "../models/Order";
import { getSetting, setSetting } from "../models/Setting";

type OrderDoc = HydratedDocument<OrderAttrs>;

const API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID_KEY = "telegram_chat_id";

/* ─── Low-level API helper ───────────────────────────────── */

interface TgResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<TgResponse<T>> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === "getUpdates" ? 60_000 : 8_000),
  });
  return (await res.json()) as TgResponse<T>;
}

/** Env wins; otherwise the chat that last ran /start against the bot. */
async function resolveChatId(): Promise<string | null> {
  if (env.TELEGRAM_CHAT_ID) return env.TELEGRAM_CHAT_ID;
  return getSetting<string>(CHAT_ID_KEY);
}

/* ─── Message formatting ─────────────────────────────────── */

interface L {
  ru?: string;
  en?: string;
  vi?: string;
}

/** Kitchen-facing label — Vietnamese first, then Russian, then English. */
const label = (v: L | null | undefined): string => v?.vi || v?.ru || v?.en || "";

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "🆕 Chờ xác nhận",
  confirmed: "✅ Đã xác nhận",
  preparing: "👨‍🍳 Đang nấu",
  ready: "🔔 Sẵn sàng",
  served: "🍽 Đã phục vụ",
  cancelled: "❌ Đã huỷ",
};

/** Which status buttons to show for the order's current state. */
const NEXT_ACTIONS: Record<OrderStatus, { status: OrderStatus; label: string }[]> = {
  pending: [
    { status: "confirmed", label: "✅ Xác nhận" },
    { status: "cancelled", label: "❌ Từ chối" },
  ],
  confirmed: [
    { status: "preparing", label: "👨‍🍳 Bắt đầu nấu" },
    { status: "cancelled", label: "❌ Huỷ" },
  ],
  preparing: [
    { status: "ready", label: "🔔 Món sẵn sàng" },
    { status: "cancelled", label: "❌ Huỷ" },
  ],
  ready: [{ status: "served", label: "🍽 Đã phục vụ" }],
  served: [],
  cancelled: [],
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const formatRub = (n: number): string => `${n.toLocaleString("ru-RU")} ₽`;

function buildMessage(order: OrderDoc, isNew: boolean): string {
  const lines: string[] = [];
  const table = order.table ?? { label: "", type: "standard" };
  const vip = table.type === "vip" ? " ⭐ VIP" : "";
  lines.push(`🍲 <b>${isNew ? "Đơn mới" : "Đơn"} #${order.orderNumber}</b>`);
  lines.push(`🪑 Bàn: <b>${escapeHtml(table.label ?? "")}</b>${vip}`);

  const name = order.customer?.name?.trim();
  const phone = order.customer?.phone?.trim();
  if (name || phone) lines.push(`👤 ${escapeHtml([name, phone].filter(Boolean).join(" · "))}`);

  lines.push("");
  for (const item of order.items) {
    const variant = label(item.variantName as L | null);
    const title = escapeHtml(label(item.name as L));
    const suffix = variant ? ` (${escapeHtml(variant)})` : "";
    lines.push(`• ${item.quantity}× ${title}${suffix} — ${formatRub(item.lineTotal)}`);
    if (item.note?.trim()) lines.push(`   ✏️ ${escapeHtml(item.note.trim())}`);
  }

  if (order.note?.trim()) {
    lines.push("");
    lines.push(`📝 ${escapeHtml(order.note.trim())}`);
  }

  lines.push("");
  lines.push(`💰 <b>Tổng: ${formatRub(order.total)}</b>`);
  lines.push(`📊 Trạng thái: <b>${STATUS_LABEL[order.status as OrderStatus]}</b>`);

  return lines.join("\n");
}

type TgButton = { text: string; callback_data: string } | { text: string; url: string };

function keyboard(order: OrderDoc) {
  const id = String(order._id);
  const rows: TgButton[][] = NEXT_ACTIONS[order.status as OrderStatus].map((a) => [
    { text: a.label, callback_data: `o:${id}:${a.status}` },
  ]);
  rows.push([{ text: "🔗 Mở trong web", url: `${env.FRONTEND_URL}/admin/orders/${id}` }]);
  return { inline_keyboard: rows };
}

/* ─── Outbound: new order + status changes ───────────────── */

/**
 * Post a new order to the kitchen chat with accept/reject buttons. Stores the
 * message id on the order so later status changes edit it in place.
 * Fire-and-forget: a Telegram outage must never block order creation.
 */
export async function sendOrderNotification(order: OrderDoc): Promise<void> {
  if (!features.telegram) {
    console.warn("[telegram] not configured — skipping notification");
    return;
  }
  try {
    const chatId = await resolveChatId();
    if (!chatId) {
      console.warn("[telegram] no chat id yet — send /start to the bot once");
      return;
    }
    const r = await tg<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text: buildMessage(order, true),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: keyboard(order),
    });
    if (!r.ok || !r.result) {
      console.error("[telegram] sendMessage failed:", r.error_code, r.description);
      return;
    }
    order.set("telegram", { chatId, messageId: r.result.message_id });
    await order.save();
  } catch (err) {
    console.error("[telegram] sendMessage error:", (err as Error).message);
  }
}

/** Edit the order's kitchen message to reflect its current status + buttons. */
export async function notifyStatusChange(order: OrderDoc): Promise<void> {
  if (!features.telegram) return;
  const tgRef = order.telegram as { chatId?: string; messageId?: number } | null;
  if (!tgRef?.chatId || !tgRef.messageId) return;
  try {
    await tg("editMessageText", {
      chat_id: tgRef.chatId,
      message_id: tgRef.messageId,
      text: buildMessage(order, false),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: keyboard(order),
    });
  } catch (err) {
    console.error("[telegram] editMessageText error:", (err as Error).message);
  }
}

/* ─── Inbound: long-polling loop ─────────────────────────── */

let polling = false;

interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number; type: string }; text?: string; from?: { first_name?: string } };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
    from?: { first_name?: string };
  };
}

async function handleMessage(msg: NonNullable<TgUpdate["message"]>): Promise<void> {
  const text = (msg.text ?? "").trim();
  const chatId = String(msg.chat.id);

  if (text === "/start" || text === "/id") {
    // Bind this chat as the notification target (env var still takes priority).
    if (!env.TELEGRAM_CHAT_ID) await setSetting(CHAT_ID_KEY, chatId);
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `✅ <b>Đã kết nối BunPho</b>\n` +
        `Chat id: <code>${chatId}</code>\n` +
        `Bạn sẽ nhận thông báo đơn hàng mới ở đây kèm nút xác nhận / từ chối.`,
      parse_mode: "HTML",
    });
    return;
  }

  // Any other message while unbound — nudge the user to run /start.
  if (!(await resolveChatId())) {
    await tg("sendMessage", { chat_id: chatId, text: "Gửi /start để nhận thông báo đơn hàng BunPho." });
  }
}

async function handleCallback(cq: NonNullable<TgUpdate["callback_query"]>): Promise<void> {
  const answer = (text: string, alert = false) =>
    tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert });

  const match = /^o:([a-f\d]{24}):(\w+)$/.exec(cq.data ?? "");
  if (!match || !cq.message) return void answer("Không hợp lệ");
  const [, orderId, next] = match;

  if (!ORDER_STATUSES.includes(next as OrderStatus)) return void answer("Trạng thái không hợp lệ");

  // Only act on presses coming from the bound chat.
  const chatId = await resolveChatId();
  if (chatId && String(cq.message.chat.id) !== chatId) return void answer("Không có quyền", true);

  const order = await Order.findById(orderId);
  if (!order) return void answer("Không tìm thấy đơn", true);

  const allowed = NEXT_ACTIONS[order.status as OrderStatus].some((a) => a.status === next);
  if (order.status === next) {
    await answer(`Đơn đã ở trạng thái "${STATUS_LABEL[next as OrderStatus]}"`);
    await notifyStatusChange(order);
    return;
  }
  if (!allowed) {
    await answer("Đơn đã được cập nhật ở nơi khác");
    await notifyStatusChange(order);
    return;
  }

  order.status = next as OrderStatus;
  order.statusHistory.push({ status: next as OrderStatus, at: new Date() });
  if (!order.telegram) {
    order.set("telegram", { chatId: String(cq.message.chat.id), messageId: cq.message.message_id });
  }
  await order.save();

  await answer(`✔️ ${STATUS_LABEL[next as OrderStatus]}`);
  await notifyStatusChange(order);
}

/** Start the getUpdates loop. Safe to call once; no-ops if already running. */
export function startTelegramPolling(): void {
  if (polling || !features.telegram) return;
  polling = true;

  void (async () => {
    // Long polling and webhooks are mutually exclusive.
    try {
      await tg("deleteWebhook", { drop_pending_updates: false });
    } catch {
      /* ignore */
    }
    console.log("[telegram] polling for updates…");

    let offset = 0;
    while (polling) {
      try {
        const r = await tg<TgUpdate[]>("getUpdates", {
          offset,
          timeout: 50,
          allowed_updates: ["message", "callback_query"],
        });
        if (!r.ok) {
          if (r.error_code === 409) {
            console.warn("[telegram] 409 conflict — another poller is running; backing off");
            await sleep(15_000);
          } else {
            console.error("[telegram] getUpdates:", r.error_code, r.description);
            await sleep(5_000);
          }
          continue;
        }
        for (const u of r.result ?? []) {
          offset = u.update_id + 1;
          try {
            if (u.message) await handleMessage(u.message);
            else if (u.callback_query) await handleCallback(u.callback_query);
          } catch (err) {
            console.error("[telegram] update handler error:", (err as Error).message);
          }
        }
      } catch (err) {
        // Network hiccup / timeout — pause briefly and retry.
        if ((err as Error).name !== "TimeoutError") {
          console.error("[telegram] poll loop error:", (err as Error).message);
        }
        await sleep(3_000);
      }
    }
    console.log("[telegram] polling stopped");
  })();
}

export function stopTelegramPolling(): void {
  polling = false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
