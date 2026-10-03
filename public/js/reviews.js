// Reviews page: show what visitors wrote and let them add their own.
import { escapeHtml } from './lib/format.js';
import { track } from './track.js';

const $ = (s) => document.querySelector(s);
let all = [], topics = [], rating = 0;
const stars = (n) => `<span class="stars" aria-label="${n} out of 5 stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
const when = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function paint() {
  const filter = $('#r-filter').value;
  const list = filter ? all.filter((r) => r.topic === filter) : all;
  $('#review-list').innerHTML = list.length ? list.map((r) => `
    <article class="card review">
      <div class="review-head"><span class="avatar" aria-hidden="true">${escapeHtml(r.name.slice(0, 1).toUpperCase())}</span>
        <div><b>${escapeHtml(r.name)}</b><div class="small muted">${when(r.date)} · ${escapeHtml(r.topic)}</div></div>${stars(r.rating)}</div>
      <p style="margin:10px 0 0;white-space:pre-line">${escapeHtml(r.text)}</p>
    </article>`).join('') : '<p class="muted">No reviews here yet. Be the first!</p>';
}

function summary() {
  const n = all.length;
  const avg = n ? all.reduce((s, r) => s + r.rating, 0) / n : 0;
  const bars = [5, 4, 3, 2, 1].map((k) => {
    const c = all.filter((r) => r.rating === k).length;
    return `<div class="bar-row"><span>${k} ★</span><div class="rbar"><i style="width:${n ? (c / n) * 100 : 0}%"></i></div><span class="muted">${c}</span></div>`;
  }).join('');
  $('#summary').innerHTML = n ? `<div class="avg"><div class="big">${avg.toFixed(1)}</div>${stars(Math.round(avg))}<div class="muted small">${n} review${n > 1 ? 's' : ''}</div></div><div class="bars">${bars}</div>`
    : '<p style="margin:0">⭐ No reviews yet. Your opinion could be the first one here!</p>';
}

async function loadReviews() {
  try {
    const res = await fetch('/api/reviews');
    const data = await res.json();
    all = data.reviews || [];
    topics = data.topics || [];
    $('#r-topic').innerHTML = topics.map((t) => `<option>${escapeHtml(t)}</option>`).join('');
    $('#r-filter').innerHTML = '<option value="">All topics</option>' + topics.map((t) => `<option>${escapeHtml(t)}</option>`).join('');
    summary();
    paint();
  } catch {
    $('#summary').innerHTML = '<p class="muted" style="margin:0">Reviews could not be loaded right now. Please try again later.</p>';
  }
}

document.querySelectorAll('.stars-input button').forEach((b) => b.addEventListener('click', () => {
  rating = Number(b.dataset.v);
  document.querySelectorAll('.stars-input button').forEach((x) => {
    x.classList.toggle('on', Number(x.dataset.v) <= rating);
    x.setAttribute('aria-checked', String(Number(x.dataset.v) === rating));
  });
}));
$('#r-text').addEventListener('input', (e) => { $('#r-count').textContent = e.target.value.length; });
$('#r-filter').addEventListener('change', paint);

$('#review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#r-msg');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  msg.innerHTML = '';
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('#r-name').value, rating, topic: $('#r-topic').value, text: $('#r-text').value, website: $('#r-website').value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    track('post_review', { rating });
    all.unshift(data.review);
    summary();
    paint();
    e.target.reset();
    rating = 0;
    document.querySelectorAll('.stars-input button').forEach((x) => x.classList.remove('on'));
    $('#r-count').textContent = '0';
    msg.innerHTML = '<div class="notice" style="margin:0">🎉 Thank you! Your review is published.</div>';
  } catch (err) {
    msg.innerHTML = `<div class="notice error" style="margin:0">${escapeHtml(err.message)}</div>`;
  }
  btn.disabled = false;
});

loadReviews();
