const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");

loadEnvFile(path.join(ROOT_DIR, ".env"));

const IS_PASSENGER = typeof PhusionPassenger !== "undefined" || process.env.LISTEN_TARGET === "passenger";
const LISTEN_TARGET = IS_PASSENGER ? "passenger" : Number(process.env.PORT || 3000);
const TELEGRAM_DISABLED = process.env.TELEGRAM_DISABLED === "true";
const BOT_TOKEN = TELEGRAM_DISABLED ? "" : process.env.TELEGRAM_BOT_TOKEN || "";
const OWNER_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const ENABLE_BOT_POLLING = process.env.ENABLE_BOT_POLLING !== "false";

const BOT_COMMANDS = [
  { command: "leads", description: "Активные заявки" },
  { command: "all", description: "Последние заявки" },
  { command: "help", description: "Список команд" },
];

const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "Активные заявки" }, { text: "Все заявки" }],
    [{ text: "Помощь" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

ensureStorage();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/api/leads") {
      await handleLeadRequest(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/reviews") {
      sendJson(response, 200, buildReviewsPayload(url.searchParams));
      return;
    }

    if (request.method === "GET") {
      serveStatic(url.pathname, response);
      return;
    }

    sendJson(response, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, error: "Server error" });
  }
});

server.listen(LISTEN_TARGET, () => {
  console.log(
    IS_PASSENGER
      ? "Site and CRM server started by Passenger"
      : `Site and CRM server: http://localhost:${LISTEN_TARGET}`
  );
  if (!BOT_TOKEN) {
    console.log("Telegram bot is disabled: set TELEGRAM_BOT_TOKEN in .env");
  } else if (!OWNER_CHAT_ID) {
    console.log("Telegram notifications are disabled: set TELEGRAM_CHAT_ID in .env");
    console.log("Send /start to your bot while this server is running to see your chat_id.");
  } else {
    console.log(`Telegram notifications enabled for chat ${OWNER_CHAT_ID}`);
  }
});

if (BOT_TOKEN && ENABLE_BOT_POLLING) {
  setupBotMenu().catch((error) => {
    console.error("Telegram menu setup failed:", error.message);
  });
  startBotPolling();
}

async function handleLeadRequest(request, response) {
  const body = await readJsonBody(request);
  const lead = normalizeLead(body, request);

  if (!lead.name || !lead.phone) {
    sendJson(response, 400, { ok: false, error: "Укажите имя и телефон." });
    return;
  }

  const leads = readLeads();
  lead.id = getNextLeadId(leads);
  lead.createdAt = new Date().toISOString();
  lead.status = "new";
  leads.push(lead);
  writeLeads(leads);

  if (BOT_TOKEN && OWNER_CHAT_ID) {
    try {
      await sendTelegramMessage(OWNER_CHAT_ID, renderLeadMessage(lead), {
        reply_markup: MAIN_KEYBOARD,
      });
    } catch (error) {
      console.error("Telegram send failed:", error.message);
    }
  }

  sendJson(response, 200, {
    ok: true,
    leadId: lead.id,
    message: "Заявка отправлена. Я скоро свяжусь с вами.",
  });
}

function normalizeLead(body, request) {
  return {
    name: cleanText(body.name, 80),
    phone: cleanText(body.phone, 40),
    message: cleanText(body.message, 1200),
    service: cleanText(body.service, 120),
    urgency: cleanText(body.urgency, 120),
    estimate: cleanText(body.estimate, 40),
    pageUrl: cleanText(body.pageUrl, 240),
    userAgent: cleanText(request.headers["user-agent"] || "", 240),
  };
}

function renderLeadMessage(lead) {
  const lines = [
    "Новая заявка",
    "",
    `<b>№:</b> ${lead.id}`,
    `<b>Имя:</b> ${escapeHtml(lead.name)}`,
    `<b>Телефон:</b> <code>${escapeHtml(lead.phone)}</code>`,
  ];

  if (lead.service) lines.push(`<b>Услуга:</b> ${escapeHtml(lead.service)}`);
  if (lead.urgency) lines.push(`<b>Срочность:</b> ${escapeHtml(lead.urgency)}`);
  if (lead.estimate) lines.push(`<b>Ориентир:</b> ${escapeHtml(lead.estimate)}`);
  if (lead.message) lines.push("", `<b>Описание:</b> ${escapeHtml(lead.message)}`);

  lines.push(
    "",
    `<b>Время:</b> ${formatDateTime(lead.createdAt)}`,
    "",
    `Команды: /done_${lead.id} /delete_${lead.id} /lead_${lead.id}`
  );

  return lines.join("\n");
}

function renderLeadDetails(lead) {
  return [
    `<b>Заявка №${lead.id}</b>`,
    `<b>Статус:</b> ${escapeHtml(lead.status)}`,
    `<b>Создана:</b> ${formatDateTime(lead.createdAt)}`,
    `<b>Имя:</b> ${escapeHtml(lead.name)}`,
    `<b>Телефон:</b> <code>${escapeHtml(lead.phone)}</code>`,
    lead.service ? `<b>Услуга:</b> ${escapeHtml(lead.service)}` : "",
    lead.urgency ? `<b>Срочность:</b> ${escapeHtml(lead.urgency)}` : "",
    lead.estimate ? `<b>Ориентир:</b> ${escapeHtml(lead.estimate)}` : "",
    lead.message ? `\n<b>Описание:</b> ${escapeHtml(lead.message)}` : "",
    "",
    `Команды: /done_${lead.id} /delete_${lead.id}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderLeadsList(leads, title) {
  if (!leads.length) {
    return `${title}\n\nЗаявок пока нет.`;
  }

  const rows = leads.slice(-10).reverse().map((lead) => {
    const message = lead.message ? ` - ${lead.message}` : "";
    return `№${lead.id} · ${lead.status} · ${lead.name} · ${lead.phone}${message}`;
  });

  return `${title}\n\n${escapeHtml(rows.join("\n"))}`;
}

async function setupBotMenu() {
  await telegramApi("setMyCommands", { commands: BOT_COMMANDS });
}

async function startBotPolling() {
  let offset = 0;

  while (true) {
    try {
      const result = await telegramApi("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      });

      for (const update of result.result || []) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(update);
      }
    } catch (error) {
      console.error("Telegram polling failed:", error.message);
      await wait(5000);
    }
  }
}

async function handleTelegramUpdate(update) {
  const message = update.message;
  const text = message?.text?.trim();
  const chatId = String(message?.chat?.id || "");

  if (!text || !chatId) return;

  if (OWNER_CHAT_ID && chatId !== OWNER_CHAT_ID) {
    await sendTelegramMessage(chatId, "Этот бот подключен к другой CRM.");
    return;
  }

  if (text === "/start") {
    await sendTelegramMessage(chatId, renderHelpMessage(chatId), {
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  if (text === "/help" || text === "Помощь") {
    await sendTelegramMessage(chatId, renderHelpMessage(chatId), {
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  if (text === "/leads" || text === "Активные заявки") {
    const activeLeads = readLeads().filter((lead) => lead.status !== "done");
    await sendTelegramMessage(chatId, renderLeadsList(activeLeads, "<b>Активные заявки</b>"), {
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  if (text === "/all" || text === "Все заявки") {
    await sendTelegramMessage(chatId, renderLeadsList(readLeads(), "<b>Последние заявки</b>"), {
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  const leadMatch = text.match(/^\/lead_?(\d+)$/);
  if (leadMatch) {
    const lead = findLead(Number(leadMatch[1]));
    await sendTelegramMessage(chatId, lead ? renderLeadDetails(lead) : "Заявка не найдена.", {
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  const doneMatch = text.match(/^\/done_?(\d+)$/);
  if (doneMatch) {
    const lead = updateLeadStatus(Number(doneMatch[1]), "done");
    await sendTelegramMessage(
      chatId,
      lead ? `Заявка №${lead.id} отмечена как обработанная.` : "Заявка не найдена.",
      { reply_markup: MAIN_KEYBOARD }
    );
    return;
  }

  const deleteMatch = text.match(/^\/delete_?(\d+)$/);
  if (deleteMatch) {
    const lead = deleteLead(Number(deleteMatch[1]));
    await sendTelegramMessage(
      chatId,
      lead ? `Заявка №${lead.id} удалена.` : "Заявка не найдена.",
      { reply_markup: MAIN_KEYBOARD }
    );
    return;
  }

  await sendTelegramMessage(chatId, "Не понял команду. Нажмите «Помощь» или используйте /help.", {
    reply_markup: MAIN_KEYBOARD,
  });
}

function renderHelpMessage(chatId) {
  return [
    "CRM сантехнической службы готова.",
    "",
    `Ваш chat_id: <code>${escapeHtml(chatId)}</code>`,
    "",
    "Меню команд также доступно через кнопку Telegram рядом со строкой ввода.",
    "",
    "<b>Команды:</b>",
    "/leads - активные заявки",
    "/all - последние заявки",
    "/lead_1 - карточка заявки №1",
    "/done_1 - отметить заявку №1 обработанной",
    "/delete_1 - удалить заявку №1",
  ].join("\n");
}

function findLead(id) {
  return readLeads().find((lead) => lead.id === id);
}

function deleteLead(id) {
  const leads = readLeads();
  const index = leads.findIndex((lead) => lead.id === id);
  if (index === -1) return null;

  const [deletedLead] = leads.splice(index, 1);
  writeLeads(leads);
  return deletedLead;
}

function updateLeadStatus(id, status) {
  const leads = readLeads();
  const lead = leads.find((item) => item.id === id);
  if (!lead) return null;
  lead.status = status;
  lead.updatedAt = new Date().toISOString();
  writeLeads(leads);
  return lead;
}

function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(ROOT_DIR, safePath));

  if (!filePath.startsWith(ROOT_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  });
}

function telegramApi(method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (!json.ok) {
              reject(new Error(json.description || "Telegram API error"));
              return;
            }
            resolve(json);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.write(data);
    request.end();
  });
}

function sendTelegramMessage(chatId, text, extraPayload = {}) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extraPayload,
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, "[]\n", "utf8");
  }

  if (!fs.existsSync(REVIEWS_FILE)) {
    fs.writeFileSync(REVIEWS_FILE, "[]\n", "utf8");
  }
}

function readLeads() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function readReviews() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function buildReviewsPayload(searchParams = new URLSearchParams()) {
  const reviews = readReviews()
    .filter((review) => review && review.text && review.author)
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));

  const perPage = clampNumber(Number(searchParams.get("perPage") || 9), 1, 30);
  const totalPages = Math.max(1, Math.ceil(reviews.length / perPage));
  const page = clampNumber(Number(searchParams.get("page") || 1), 1, totalPages);
  const start = (page - 1) * perPage;
  const pageReviews = reviews.slice(start, start + perPage);

  const ratedReviews = reviews.filter((review) => Number(review.rating) > 0);
  const averageRating = ratedReviews.length
    ? ratedReviews.reduce((sum, review) => sum + Number(review.rating), 0) / ratedReviews.length
    : 0;

  return {
    ok: true,
    count: reviews.length,
    averageRating: Number(averageRating.toFixed(1)),
    page,
    perPage,
    totalPages,
    reviews: pageReviews,
  };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function writeLeads(leads) {
  ensureStorage();
  fs.writeFileSync(LEADS_FILE, `${JSON.stringify(leads, null, 2)}\n`, "utf8");
}

function getNextLeadId(leads) {
  return leads.reduce((max, lead) => Math.max(max, Number(lead.id) || 0), 0) + 1;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const rows = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
