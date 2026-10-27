// Dynamic replacement of player.cgi: player.cgi?code=<CODE>&begin=<ms>&end=<ms>
// Navigable snippet player: shows the turns around a focus turn, plays them,
// and lets the reader move back and forth through the whole conversation.

var conv, audioPlayer, state = { focus: 0, start: 0, end: 0, view: "orth", vis: [] }, segEls = [], turnEls = [];

function pad2(n) { return String(n).padStart(2, "0"); }

function fmtTime(sec)
{
	var s = Math.round(sec);
	return pad2(Math.floor(s / 3600)) + ":" + pad2(Math.floor(s % 3600 / 60)) + ":" + pad2(s % 60);
}

function fmtShort(sec)
{
	var s = Math.floor(sec);
	return Math.floor(s / 60) + ":" + pad2(s % 60);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// The server (server.py) renders the page with window.CONVERSATION already filled in;
// start at the turn matching begin (ms), as in the old player.cgi links.
function boot()
{
	var data = window.CONVERSATION, q = new URLSearchParams(location.search), idx = 0;
	data.turns = data.turns.map(function(t){ return [t[0], t[1] / 1000, t[2] / 1000, t[3], t[4], t[5]]; });
	if(q.get("begin") !== null) idx = turnAtTime(+q.get("begin") / 1000, data.turns, true);
	init(data, idx);
}

function init(data, idx)
{
	conv		= data;
	conv.radius	= 2;
	audioPlayer	= document.getElementById("player");
	audioPlayer.addEventListener("contextmenu", function(e){ e.preventDefault(); });
	if(conv.audio) audioPlayer.src = conv.audio;
	else { audioPlayer.hidden = true; document.getElementById("replay").hidden = true; }
	audioPlayer.addEventListener("timeupdate", onTimeUpdate);

	document.title = conv.code + " – KIParla";
	document.getElementById("conv-code").textContent = conv.code;
	var full = document.getElementById("full-link");
	if(conv.module) full.href = conv.artifacts_url + "/" + conv.module + "/html/" + conv.code + ".html"; else full.remove();
	renderInfo();
	drawLanes();
	renderAllTurns();
	if(!conv.has_translations) document.getElementById("toggle-translations").hidden = true;
	applyView();
	document.getElementById("overview-end").textContent = fmtShort(conv.duration);
	goTo(idx, false);
}

function renderInfo()
{
	var m = conv.meta, rows = [
		["codice", conv.code], ["tipo", m.type], ["durata", m.duration],
		["partecipanti", m["participants-number"]], ["anno", m.year], ["punto di raccolta", m["collection-point"]]
	];
	var grid = document.getElementById("conv-meta");
	rows.forEach(function(r)
	{
		if(!r[1]) return;
		var span = document.createElement("span");
		span.dataset.label = r[0];
		span.textContent = r[1];
		grid.appendChild(span);
	});
	var body = document.getElementById("conv-participants");
	conv.participants.forEach(function(p)
	{
		var tr = document.createElement("tr"), first = document.createElement("td");
		var dot = document.createElement("span"), strong = document.createElement("strong");
		dot.className = "dot spk-" + (speakerIndex(p.code) % 10);
		strong.textContent = p.code;
		first.appendChild(dot);
		first.appendChild(strong);
		tr.appendChild(first);
		["occupation", "gender", "birth-region", "age-range", "study-level"].forEach(function(k)
		{
			var td = document.createElement("td");
			td.textContent = p[k];
			tr.appendChild(td);
		});
		body.appendChild(tr);
	});
}

// ── timeline: speaker lanes, same markup as the conversation pages ──
function drawLanes()
{
	var map = document.getElementById("overview"), speakers = [];
	conv.turns.forEach(function(t){ if(speakers.indexOf(t[0]) < 0) speakers.push(t[0]); });
	var tracks = {};
	speakers.forEach(function(spk, i)
	{
		var lane = document.createElement("div"), label = document.createElement("span"), track = document.createElement("div");
		lane.className	= "speaker-lane";
		label.className	= "speaker-label spk-" + (i % 10);
		label.textContent = spk;
		track.className	= "speaker-track";
		lane.appendChild(label);
		lane.appendChild(track);
		map.appendChild(lane);
		tracks[spk] = [track, i % 10];
	});
	conv.turns.forEach(function(t, idx)
	{
		var seg = document.createElement("span");
		seg.className	= "speaker-segment spk-" + tracks[t[0]][1];
		seg.dataset.turn = idx;
		seg.style.left	= (100 * t[1] / conv.duration) + "%";
		seg.style.width	= Math.max(100 * (t[2] - t[1]) / conv.duration, 0.15) + "%";
		tracks[t[0]][0].appendChild(seg);
		segEls.push(seg);
	});
}

// ── navigation ──
// Turns shown in the current view: the orthographic text of some units is empty
// (e.g. only a pause), and those are skipped there, as in the conversation pages.
function computeVisible()
{
	state.vis = [];
	conv.turns.forEach(function(t, i){ if(state.view === "jeff" || t[3]) state.vis.push(i); });
}

// Nearest visible turn at or after idx (or before it, at the end of the conversation).
function snapVisible(idx)
{
	var vis = state.vis, p = vis.findIndex(function(v){ return v >= idx; });
	return p < 0 ? vis[vis.length - 1] : vis[p];
}

function stepFrom(idx, d)
{
	var p = clamp(state.vis.indexOf(snapVisible(idx)) + d, 0, state.vis.length - 1);
	return state.vis[p];
}

// keepAudio: only redraw (view switch), leave the audio where it is.
function goTo(idx, play, keepAudio)
{
	var vis = state.vis, n = vis.length;
	idx = snapVisible(clamp(idx, 0, conv.turns.length - 1));
	var p = vis.indexOf(idx), first = vis[clamp(p - conv.radius, 0, n - 1)], last = vis[clamp(p + conv.radius, 0, n - 1)];
	state.focus = idx;
	var span = vis.slice(vis.indexOf(first), vis.indexOf(last) + 1).map(function(i){ return conv.turns[i]; });
	state.start = Math.min.apply(null, span.map(function(t){ return t[1]; }));
	state.end   = Math.max.apply(null, span.map(function(t){ return t[2]; }));

	renderTurns(first, last, idx);
	renderTimeline(first, last);
	document.getElementById("snippet-start").textContent	= fmtTime(state.start);
	document.getElementById("snippet-end").textContent	= fmtTime(state.end);
	document.getElementById("snippet-len").textContent	= Math.round(state.end - state.start) + " s";
	document.getElementById("snippet-turns").textContent	= (vis.indexOf(first) + 1) + "–" + (vis.indexOf(last) + 1) + " di " + n;
	document.getElementById("prev").disabled = p === 0;
	document.getElementById("next").disabled = p === n - 1;
	var q = new URLSearchParams({ code: conv.code, begin: Math.round(conv.turns[idx][1] * 1000), end: Math.round(conv.turns[idx][2] * 1000) });
	history.replaceState(null, "", "?" + q.toString());

	if(keepAudio) return;
	audioPlayer.currentTime = state.start;
	if(play !== false) audioPlayer.play().catch(function(){});
	updatePlayhead(state.start);
}

// All turns are rendered once; navigation only moves the highlight and the scroll position,
// and switching view only swaps the text.
function renderAllTurns()
{
	var box = document.getElementById("turns"), frag = document.createDocumentFragment();
	conv.turns.forEach(function(t, i)
	{
		var row = document.createElement("div"), meta = document.createElement("div");
		var spk = document.createElement("span"), txt = document.createElement("span");
		row.className	= "turn";
		row.dataset.turn = i;
		meta.className	= "turn-meta";
		spk.className	= "turn-speaker spk-" + (speakerIndex(t[0]) % 10);
		txt.className	= "turn-text";
		meta.appendChild(spk);
		row.appendChild(meta);
		row.appendChild(txt);
		t[5].forEach(function(text)
		{
			var label = document.createElement("span"), tr = document.createElement("span");
			label.className	= "turn-translation-label";
			tr.className	= "turn-translation-text";
			tr.textContent	= text;
			row.appendChild(label);
			row.appendChild(tr);
		});
		frag.appendChild(row);
	});
	box.appendChild(frag);
	turnEls = Array.prototype.slice.call(box.children);
}

// Text (orthographic or enriched), hidden turns and speaker labels for the current view.
function applyView()
{
	computeVisible();
	var prev = null, shown = {};
	state.vis.forEach(function(i){ shown[i] = true; });
	turnEls.forEach(function(row, i)
	{
		var t = conv.turns[i];
		row.hidden = !shown[i];
		if(!shown[i]) return;
		row.querySelector(".turn-text").innerHTML = (state.view === "jeff" ? t[4] : t[3]);
		row.querySelector(".turn-speaker").textContent = t[0] === prev ? "" : t[0];
		prev = t[0];
	});
}

function setView(view)
{
	state.view = view;
	document.querySelectorAll("[data-view]").forEach(function(b){ b.classList.toggle("active", b.dataset.view === view); });
	applyView();
	goTo(state.focus, false, true);
}

function renderTurns(first, last, focus)
{
	turnEls.forEach(function(row, i)
	{
		row.classList.toggle("in-snippet", i >= first && i <= last);
		row.classList.toggle("focus", i === focus);
	});
	var box = document.getElementById("turns"), row = turnEls[focus];
	box.scrollTo({ top: row.offsetTop - (box.clientHeight - row.offsetHeight) / 2,
	               behavior: box.dataset.ready ? "smooth" : "auto" });
	box.dataset.ready = "1";
}

function speakerIndex(spk)
{
	var seen = [];
	conv.turns.some(function(t){ if(seen.indexOf(t[0]) < 0) seen.push(t[0]); return t[0] === spk; });
	return seen.indexOf(spk);
}

function renderTimeline(first, last)
{
	segEls.forEach(function(seg, i){ seg.classList.toggle("active", i >= first && i <= last); });
	var band = document.getElementById("overview-window");
	band.style.left		= (100 * state.start / conv.duration) + "%";
	band.style.width	= (100 * (state.end - state.start) / conv.duration) + "%";
}

function updatePlayhead(t)
{
	document.getElementById("overview-playhead").style.left = (100 * t / conv.duration) + "%";
	document.getElementById("overview-pos").textContent = fmtShort(t);
}

function onTimeUpdate()
{
	var t = audioPlayer.currentTime;
	if(t >= state.end && !audioPlayer.paused) audioPlayer.pause();
	updatePlayhead(t);
}

function turnAtTime(t, turns, byBegin)
{
	turns = turns || conv.turns;
	var best = 0, dist = Infinity;
	turns.forEach(function(x, i)
	{
		var d = byBegin ? Math.abs(x[1] - t) : (t < x[1] ? x[1] - t : (t > x[2] ? t - x[2] : 0));
		if(d < dist) { dist = d; best = i; }
	});
	return best;
}

// ── events ──
document.addEventListener("click", function(e)
{
	if(e.target.closest("[data-action=toggle-sidebar]")) { toggleSidebar(); return; }
	if(!conv) return;
	if(e.target.closest("#prev")) { goTo(stepFrom(state.focus, -1)); return; }
	if(e.target.closest("#next")) { goTo(stepFrom(state.focus, 1)); return; }
	var view = e.target.closest("[data-view]");
	if(view) { setView(view.dataset.view); return; }
	var trBtn = e.target.closest("#toggle-translations");
	if(trBtn)
	{
		trBtn.classList.toggle("active", document.querySelector(".transcript").classList.toggle("show-translations"));
		goTo(state.focus, false, true);
		return;
	}
	if(e.target.closest("#replay")) { goTo(state.focus); return; }
	var turn = e.target.closest(".turn[data-turn]");
	if(turn) { goTo(+turn.dataset.turn); return; }
	var seg = e.target.closest(".speaker-segment");
	if(seg) { goTo(+seg.dataset.turn); return; }
	var track = e.target.closest(".timeline-track, .speaker-track");
	if(track)
	{
		var inner = document.querySelector(".speaker-track").getBoundingClientRect();
		goTo(turnAtTime(clamp((e.clientX - inner.left) / inner.width, 0, 1) * conv.duration));
	}
});

document.addEventListener("keydown", function(e)
{
	if(!conv || e.target.closest("audio, input, textarea")) return;
	if(e.key === "ArrowLeft")  { e.preventDefault(); goTo(stepFrom(state.focus, -1)); }
	if(e.key === "ArrowRight") { e.preventDefault(); goTo(stepFrom(state.focus, 1)); }
});

function toggleSidebar()
{
	var open = document.getElementById("sidebar").classList.toggle("open");
	var btn = document.querySelector(".sidebar-toggle");
	btn.classList.toggle("active", open);
	btn.setAttribute("aria-expanded", open);
}

boot();
