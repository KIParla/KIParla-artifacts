
var currentFontSize = 15;
var isTimelineDragging = false;
var isTimelineVisible = true;
var timelineZoom = 1;
var timelineWindowCenter = 0.5;

function showPanel(id) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('visible'));
    document.querySelectorAll('.toggle-bar button[data-panel]').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('visible');
    document.querySelector('[data-panel="' + id + '"]').classList.add('active');
    updateTimeline();
}
function toggleTimes(btn) {
    var t = document.querySelector('.transcript');
    var on = t.classList.toggle('show-times');
    btn.classList.toggle('active', on);
}
function toggleTimeline(btn) {
    isTimelineVisible = !isTimelineVisible;
    document.body.classList.toggle('timeline-collapsed', !isTimelineVisible);
    if (btn) btn.classList.toggle('active', isTimelineVisible);
    updateTimeline();
}
function toggleSidebar() {
    var sb = document.getElementById('sidebar');
    var btn = document.querySelector('.sidebar-toggle');
    var open = sb.classList.toggle('open');
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function increaseFontSize() {
    currentFontSize = Math.min(currentFontSize + 1, 24);
    updateTranscriptFontSize();
}
function decreaseFontSize() {
    currentFontSize = Math.max(currentFontSize - 1, 11);
    updateTranscriptFontSize();
}
function updateTranscriptFontSize() {
    document.documentElement.style.setProperty('--transcript-font-size', currentFontSize + 'px');
}
function clearHoverLinked() {
    document.querySelectorAll('.hover-linked').forEach(function(node) {
        node.classList.remove('hover-linked');
    });
}
function setHoverLinked(tuIdx) {
    clearHoverLinked();
    if (tuIdx == null || tuIdx === '') return;
    document.querySelectorAll('[data-tu-idx="' + tuIdx + '"]').forEach(function(node) {
        node.classList.add('hover-linked');
    });
}
function setupHoverSync() {
    document.addEventListener('mouseover', function(event) {
        var target = event.target.closest('[data-tu-idx]');
        if (!target) return;
        setHoverLinked(target.dataset.tuIdx);
    });
    document.addEventListener('mouseout', function(event) {
        var target = event.target.closest('[data-tu-idx]');
        if (!target) return;
        var related = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest('[data-tu-idx]') : null;
        if (related && related.dataset.tuIdx === target.dataset.tuIdx) return;
        clearHoverLinked();
    });
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function getTimelineWindow() {
    var span = 1 / timelineZoom;
    var start = clamp(timelineWindowCenter - (span / 2), 0, 1 - span);
    return { start: start, end: start + span, span: span };
}
function ratioToWindowPercent(ratio) {
    var windowInfo = getTimelineWindow();
    return ((ratio - windowInfo.start) / windowInfo.span) * 100;
}
function updateTimelineGeometry(timeline, focusRatio) {
    if (!timeline) return;
    if (typeof focusRatio === 'number' && Number.isFinite(focusRatio)) {
        timelineWindowCenter = focusRatio;
    }
    var windowInfo = getTimelineWindow();
    timeline.querySelectorAll('.timeline-marker').forEach(function(marker) {
        var ratio = parseFloat(marker.dataset.ratio || '0');
        var visible = ratio >= windowInfo.start && ratio <= windowInfo.end;
        marker.style.display = visible ? 'block' : 'none';
        if (visible) {
            marker.style.left = ratioToWindowPercent(ratio) + '%';
        }
    });
    timeline.querySelectorAll('.speaker-segment').forEach(function(segment) {
        var startRatio = parseFloat(segment.dataset.startRatio || '0');
        var endRatio = parseFloat(segment.dataset.endRatio || startRatio);
        var clippedStart = Math.max(startRatio, windowInfo.start);
        var clippedEnd = Math.min(endRatio, windowInfo.end);
        var visible = clippedEnd > clippedStart;
        segment.style.display = visible ? 'block' : 'none';
        if (visible) {
            segment.style.left = ratioToWindowPercent(clippedStart) + '%';
            segment.style.width = Math.max(((clippedEnd - clippedStart) / windowInfo.span) * 100, 0.35) + '%';
        }
    });
    var zoomLabel = timeline.querySelector('.timeline-zoom-label');
    if (zoomLabel) {
        zoomLabel.textContent = timelineZoom.toFixed(1) + 'x';
    }
}
function zoomTimeline(factor) {
    var timeline = document.getElementById('timeline');
    if (!timeline) return;
    var playhead = timeline.querySelector('.timeline-playhead');
    var focusRatio = playhead ? parseFloat(playhead.dataset.ratio || '0') : timelineWindowCenter;
    timelineZoom = clamp(Math.round((timelineZoom * factor) * 10) / 10, 1, 12);
    updateTimelineGeometry(timeline, focusRatio);
    updateTimeline();
}
function getVisiblePanel() {
    return document.querySelector('.panel.visible');
}
function getTurnByTuIdx(tuIdx) {
    var panel = getVisiblePanel();
    return panel ? panel.querySelector('.turn[data-tu-idx="' + tuIdx + '"]') : null;
}
function scrollToTuIdx(tuIdx) {
    if (tuIdx == null || tuIdx === '') return;
    var turn = getTurnByTuIdx(tuIdx);
    if (!turn) return;
    setHoverLinked(tuIdx);
    scrollToTurn(turn);
}
function scrollToTimelineUnit(event) {
    event.stopPropagation();
    var target = event.currentTarget || event.target.closest('[data-tu-idx]');
    if (!target) return;
    scrollToTuIdx(target.dataset.tuIdx);
}
function getTimedTurns() {
    var panel = getVisiblePanel();
    return panel ? Array.from(panel.querySelectorAll('.turn[data-begin-ms], .turn[data-end-ms]')) : [];
}
function getTrackMetrics(turns) {
    if (!turns.length) return null;
    var maxEnd = 0;
    turns.forEach(function(turn) {
        var begin = parseInt(turn.dataset.beginMs || '0', 10);
        var end = parseInt(turn.dataset.endMs || turn.dataset.beginMs || '0', 10);
        if (end > maxEnd) maxEnd = end;
        if (begin > maxEnd) maxEnd = begin;
    });
    return maxEnd > 0 ? { maxEnd: maxEnd } : null;
}
function getCurrentTurnFromScroll(turns) {
    var current = turns[0];
    var targetY = window.innerHeight * 0.42;
    var bestDistance = Infinity;
    turns.forEach(function(turn) {
        var rect = turn.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        var distance = Math.abs(center - targetY);
        if (distance < bestDistance) {
            bestDistance = distance;
            current = turn;
        }
    });
    return current;
}
function setTimelineState(timeline, currentTurn, metrics) {
    if (!timeline || !currentTurn || !metrics) return;
    var begin = parseInt(currentTurn.dataset.beginMs || '0', 10);
    var end = parseInt(currentTurn.dataset.endMs || currentTurn.dataset.beginMs || '0', 10);
    var ratio = metrics.maxEnd ? Math.min(Math.max(begin / metrics.maxEnd, 0), 1) : 0;
    updateTimelineGeometry(timeline, ratio);
    var playhead = timeline.querySelector('.timeline-playhead');
    if (playhead) {
        playhead.dataset.ratio = ratio;
        playhead.style.left = ratioToWindowPercent(ratio) + '%';
    }

    var currentLabel = timeline.querySelector('.timeline-current');
    var totalLabel = timeline.querySelector('.timeline-total');
    if (currentLabel) {
        currentLabel.textContent = formatMsLabel(begin, end);
    }
    if (totalLabel) {
        totalLabel.textContent = formatSingleMs(metrics.maxEnd);
    }

    timeline.querySelectorAll('.timeline-marker').forEach(function(marker) {
        marker.classList.toggle('active', marker.dataset.tuIdx === currentTurn.dataset.tuIdx);
    });
    timeline.querySelectorAll('.speaker-segment').forEach(function(segment) {
        segment.classList.toggle('active', segment.dataset.tuIdx === currentTurn.dataset.tuIdx);
    });
}
function getTurnForRatio(turns, metrics, ratio) {
    if (!turns.length || !metrics) return null;
    var targetMs = ratio * metrics.maxEnd;
    var bestTurn = turns[0];
    var bestDistance = Infinity;
    turns.forEach(function(turn) {
        var begin = parseInt(turn.dataset.beginMs || turn.dataset.endMs || '0', 10);
        var end = parseInt(turn.dataset.endMs || turn.dataset.beginMs || '0', 10);
        var center = begin + ((end - begin) / 2);
        var distance = Math.abs(center - targetMs);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestTurn = turn;
        }
    });
    return bestTurn;
}
function scrollToTurn(turn) {
    if (!turn) return;
    var rect = turn.getBoundingClientRect();
    var targetTop = window.scrollY + rect.top - (window.innerHeight * 0.28);
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
}
function getRatioFromPointer(event, track) {
    var rect = track.getBoundingClientRect();
    var clientX = event.clientX;
    if (clientX == null && event.touches && event.touches[0]) {
        clientX = event.touches[0].clientX;
    }
    if (clientX == null) return 0;
    var handleSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--timeline-handle-size')) || 14;
    var inset = handleSize / 2;
    var usableWidth = Math.max(rect.width - (inset * 2), 1);
    var localRatio = Math.min(Math.max((clientX - rect.left - inset) / usableWidth, 0), 1);
    var windowInfo = getTimelineWindow();
    return windowInfo.start + (localRatio * windowInfo.span);
}
function syncTimelineToRatio(ratio, shouldScroll) {
    var timeline = document.getElementById('timeline');
    if (!timeline) return;
    var turns = getTimedTurns();
    var metrics = getTrackMetrics(turns);
    if (!turns.length || !metrics) return;
    var turn = getTurnForRatio(turns, metrics, ratio);
    setTimelineState(timeline, turn, metrics);
    if (shouldScroll) {
        scrollToTurn(turn);
    }
}
function handleTimelinePointer(event) {
    var timeline = document.getElementById('timeline');
    if (!timeline) return;
    var track = timeline.querySelector('.timeline-track');
    if (!track) return;
    var ratio = getRatioFromPointer(event, track);
    syncTimelineToRatio(ratio, true);
}
function startTimelineDrag(event) {
    var timeline = document.getElementById('timeline');
    if (!timeline) return;
    isTimelineDragging = true;
    var playhead = timeline.querySelector('.timeline-playhead');
    if (playhead) playhead.classList.add('dragging');
    handleTimelinePointer(event);
}
function stopTimelineDrag() {
    if (!isTimelineDragging) return;
    isTimelineDragging = false;
    var timeline = document.getElementById('timeline');
    if (!timeline) return;
    var playhead = timeline.querySelector('.timeline-playhead');
    if (playhead) playhead.classList.remove('dragging');
}
function updateTimeline() {
    var timeline = document.getElementById('timeline');
    if (!timeline) return;
    if (!isTimelineVisible) {
        timeline.classList.add('hidden');
        return;
    }
    var turns = getTimedTurns();
    if (!turns.length) {
        timeline.classList.add('hidden');
        return;
    }
    timeline.classList.remove('hidden');
    var metrics = getTrackMetrics(turns);
    if (!metrics) {
        timeline.classList.add('hidden');
        return;
    }
    if (isTimelineDragging) return;
    setTimelineState(timeline, getCurrentTurnFromScroll(turns), metrics);
}
function formatSingleMs(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '';
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return hours
        ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
        : minutes + ':' + String(seconds).padStart(2, '0');
}
function formatMsLabel(begin, end) {
    var b = formatSingleMs(begin);
    var e = formatSingleMs(end);
    return b && e && b !== e ? (b + ' - ' + e) : (b || e);
}
window.addEventListener('scroll', updateTimeline, { passive: true });
window.addEventListener('resize', updateTimeline);
window.addEventListener('load', function() {
    setupHoverSync();
    updateTimeline();
});
window.addEventListener('pointermove', function(event) {
    if (!isTimelineDragging) return;
    handleTimelinePointer(event);
});
window.addEventListener('pointerup', stopTimelineDrag);
window.addEventListener('pointercancel', stopTimelineDrag);
