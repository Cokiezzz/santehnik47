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
const reviewsPagination = document.querySelector("[data-reviews-pagination]");
const reviewsRating = document.querySelector("[data-reviews-rating]");
const reviewsCount = document.querySelector("[data-reviews-count]");
const reviewsState = {
  page: 1,
  perPage: 9,
  totalPages: 1,
};

const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value || "";
  return element.innerHTML;
};

const renderStars = (rating) => {
  const roundedRating = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return "★".repeat(roundedRating) + "☆".repeat(5 - roundedRating);
};

const getVisibleReviewPages = (currentPage, totalPages) => {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((left, right) => left - right);
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

const renderReviewsPagination = () => {
  if (!reviewsPagination) return;

  if (reviewsState.totalPages <= 1) {
    reviewsPagination.innerHTML = "";
    return;
  }

  const visiblePages = getVisibleReviewPages(reviewsState.page, reviewsState.totalPages);
  let previousPage = 0;

  const pageButtons = visiblePages
    .map((page) => {
      const gap = previousPage && page - previousPage > 1 ? `<span class="reviews-pagination__gap">...</span>` : "";
      previousPage = page;
      return `
        ${gap}
        <button type="button" class="${page === reviewsState.page ? "is-active" : ""}" data-review-page="${page}" aria-label="Страница отзывов ${page}">
          ${page}
        </button>
      `;
    })
    .join("");

  reviewsPagination.innerHTML = `
    <button type="button" data-review-page="${reviewsState.page - 1}" ${reviewsState.page === 1 ? "disabled" : ""}>
      Назад
    </button>
    ${pageButtons}
    <button type="button" data-review-page="${reviewsState.page + 1}" ${reviewsState.page === reviewsState.totalPages ? "disabled" : ""}>
      Вперед
    </button>
  `;
};

const loadReviews = async (page = 1) => {
  if (!reviewsContainer) return;

  try {
    const params = new URLSearchParams({
      page: String(page),
      perPage: String(reviewsState.perPage),
    });
    const response = await fetch(`/api/reviews?${params}`);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error("Reviews unavailable");

    reviewsState.page = result.page || 1;
    reviewsState.totalPages = result.totalPages || 1;
    reviewsRating.textContent = result.averageRating ? result.averageRating.toFixed(1) : "—";
    reviewsCount.textContent = result.count;
    renderReviews(result.reviews || []);
    renderReviewsPagination();
  } catch {
    reviewsContainer.innerHTML = `
      <article class="review-card review-card--empty">
        <p>Отзывы временно недоступны. Если сайт открыт как файл, запустите его через <code>server.js</code>.</p>
      </article>
    `;
    if (reviewsPagination) reviewsPagination.innerHTML = "";
  }
};

reviewsPagination?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-page]");
  if (!button || button.disabled) return;

  const page = Number(button.dataset.reviewPage);
  if (!Number.isFinite(page) || page < 1 || page > reviewsState.totalPages) return;

  loadReviews(page);
  document.querySelector("#reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

loadReviews();

const requestForm = document.querySelector("[data-form]");
const privacyConsent = document.querySelector("[data-privacy-consent]");
const submitButton = document.querySelector("[data-submit-button]");

const updateSubmitState = () => {
  if (!submitButton || !privacyConsent) return;
  submitButton.disabled = !privacyConsent.checked;
};

privacyConsent?.addEventListener("change", updateSubmitState);
updateSubmitState();

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const note = document.querySelector("[data-form-note]");

  if (!privacyConsent.checked) {
    note.textContent = "Подтвердите согласие на обработку персональных данных.";
    updateSubmitState();
    return;
  }

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
    updateSubmitState();
    note.textContent = result.message || "Спасибо, заявка отправлена. Я скоро свяжусь с вами.";
  } catch (error) {
    note.textContent =
      "Не удалось отправить заявку. Позвоните или напишите в мессенджер, а сервер CRM проверьте отдельно.";
  } finally {
    updateSubmitState();
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
