const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const menuButton = document.querySelector("[data-menu]");
const canvas = document.querySelector("[data-hero-canvas]");

const updateHeader = () => {
  header.classList.toggle("is-scrolled", window.scrollY > 20);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

menuButton.addEventListener("click", () => {
  nav.classList.toggle("is-open");
});

nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => nav.classList.remove("is-open"));
});

const serviceSelect = document.querySelector("[data-service]");
const urgencySelect = document.querySelector("[data-urgency]");
const estimate = document.querySelector("[data-estimate]");

const formatPrice = (value) => new Intl.NumberFormat("ru-RU").format(value) + " ₽";

const updateEstimate = () => {
  const total = Number(serviceSelect.value) + Number(urgencySelect.value);
  estimate.textContent = formatPrice(total);
};

serviceSelect.addEventListener("change", updateEstimate);
urgencySelect.addEventListener("change", updateEstimate);
updateEstimate();

document.querySelectorAll("[data-faq] button").forEach((button) => {
  button.addEventListener("click", () => {
    const panel = button.nextElementSibling;
    const isOpen = panel.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
    button.querySelector("span").textContent = isOpen ? "−" : "+";
  });
});

const reviewsContainer = document.querySelector("[data-reviews]");
const reviewsRating = document.querySelector("[data-reviews-rating]");
const reviewsCount = document.querySelector("[data-reviews-count]");

const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value || "";
  return element.innerHTML;
};

const renderStars = (rating) => {
  const roundedRating = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return "★".repeat(roundedRating) + "☆".repeat(5 - roundedRating);
};

const renderReviews = (reviews) => {
  if (!reviews.length) {
    reviewsContainer.innerHTML = `
      <article class="review-card review-card--empty">
        <p>Отзывы пока не добавлены. Заполните <code>data/reviews.json</code>, и они появятся здесь.</p>
      </article>
    `;
    return;
  }

  reviewsContainer.innerHTML = reviews
    .map((review) => {
      const source = escapeText(review.source || "Отзыв");
      const author = escapeText(review.author);
      const text = escapeText(review.text);
      const date = escapeText(review.date || "");
      const url = escapeText(review.url || "");
      const rating = renderStars(review.rating);

      return `
        <article class="review-card">
          <div class="review-card__top">
            <span class="review-card__source">${source}</span>
            <span class="review-card__rating" aria-label="Оценка ${escapeText(review.rating)} из 5">${rating}</span>
          </div>
          <h3>${author}</h3>
          ${date ? `<time datetime="${date}">${date}</time>` : ""}
          <p>${text}</p>
          ${url ? `<a class="review-card__link" href="${url}" target="_blank" rel="noopener">Открыть источник</a>` : ""}
        </article>
      `;
    })
    .join("");
};

const loadReviews = async () => {
  if (!reviewsContainer) return;

  try {
    const response = await fetch("/api/reviews");
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error("Reviews unavailable");

    reviewsRating.textContent = result.averageRating ? result.averageRating.toFixed(1) : "—";
    reviewsCount.textContent = result.count;
    renderReviews(result.reviews || []);
  } catch {
    reviewsContainer.innerHTML = `
      <article class="review-card review-card--empty">
        <p>Отзывы временно недоступны. Если сайт открыт как файл, запустите его через <code>server.js</code>.</p>
      </article>
    `;
  }
};

loadReviews();

document.querySelector("[data-form]").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const note = document.querySelector("[data-form-note]");
  const formData = new FormData(form);

  const payload = {
    name: formData.get("name"),
    phone: formData.get("phone"),
    message: formData.get("message"),
    service: serviceSelect.options[serviceSelect.selectedIndex].text,
    urgency: urgencySelect.options[urgencySelect.selectedIndex].text,
    estimate: estimate.textContent,
    pageUrl: window.location.href,
  };

  submitButton.disabled = true;
  submitButton.textContent = "Отправляем...";
  note.textContent = "Отправляем заявку мастеру.";

  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Не удалось отправить заявку.");
    }

    form.reset();
    updateEstimate();
    note.textContent = result.message || "Спасибо, заявка отправлена. Я скоро свяжусь с вами.";
  } catch (error) {
    note.textContent =
      "Не удалось отправить заявку. Позвоните или напишите в мессенджер, а сервер CRM проверьте отдельно.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Отправить заявку";
  }
});

const ctx = canvas.getContext("2d");
let width = 0;
let height = 0;
let points = [];

const resizeCanvas = () => {
  const ratio = window.devicePixelRatio || 1;
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  points = Array.from({ length: 38 }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    speed: 0.35 + Math.random() * 0.85,
    size: 1.4 + Math.random() * 2.8,
    offset: index * 0.55,
  }));
};

const drawPipe = (x, y, pipeWidth, pipeHeight, color) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = pipeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + pipeHeight * 0.55, y);
  ctx.quadraticCurveTo(x + pipeHeight * 0.86, y, x + pipeHeight * 0.86, y + pipeHeight * 0.3);
  ctx.lineTo(x + pipeHeight * 0.86, y + pipeHeight * 0.66);
  ctx.quadraticCurveTo(x + pipeHeight * 0.86, y + pipeHeight, x + pipeHeight * 1.2, y + pipeHeight);
  ctx.lineTo(x + pipeHeight * 1.9, y + pipeHeight);
  ctx.stroke();
};

const animate = (time = 0) => {
  ctx.clearRect(0, 0, width, height);

  const base = ctx.createLinearGradient(width * 0.45, 0, width, height);
  base.addColorStop(0, "rgba(16, 168, 138, 0.22)");
  base.addColorStop(0.48, "rgba(22, 116, 201, 0.18)");
  base.addColorStop(1, "rgba(244, 182, 63, 0.12)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  drawPipe(width * 0.52, height * 0.16, 28, Math.min(width, height) * 0.45, "rgba(255,255,255,0.14)");
  drawPipe(width * 0.68, height * 0.42, 20, Math.min(width, height) * 0.32, "rgba(255,255,255,0.10)");
  drawPipe(width * 0.48, height * 0.62, 18, Math.min(width, height) * 0.34, "rgba(16,168,138,0.22)");

  points.forEach((point) => {
    point.y += point.speed;
    point.x += Math.sin(time * 0.001 + point.offset) * 0.35;
    if (point.y > height + 10) {
      point.y = -10;
      point.x = Math.random() * width;
    }

    ctx.beginPath();
    ctx.fillStyle = "rgba(147, 230, 217, 0.55)";
    ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
    ctx.fill();
  });

  requestAnimationFrame(animate);
};

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
animate();
