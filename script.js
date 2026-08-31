const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwxnkTmmopbzLWTdTrn_yZACS9fEKBxyL_xcQG_KDCMGtHjHs-vvU7Gjqy-5mZKIVQXag/exec';
const FIGHT_DATES = ['September 1', 'September 3'];
const DECLARATION_PASSWORD = 'Slasher15';

let selectedDate = '';
let currentView = 'fights';
let currentFightIndex = 0;
let pendingProtectedDate = '';
let selectedOverallDate = 'September 1';
let fights = [];
let results = [];
let overallRows = [];
let isLoading = false;
let isSaving = false;

function savePageState() {
  localStorage.setItem('kgbiSelectedDate', selectedDate);
  localStorage.setItem('kgbiCurrentView', currentView);
  localStorage.setItem('kgbiCurrentFightIndex', String(currentFightIndex));
}

function clearPageState() {
  selectedDate = '';
  localStorage.removeItem('kgbiSelectedDate');
  localStorage.removeItem('kgbiCurrentView');
  localStorage.removeItem('kgbiCurrentFightIndex');
  localStorage.removeItem('kgbiPageMode');
  localStorage.removeItem('kgbiOverallDate');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function callApi(params) {
  const query = new URLSearchParams({ ...params, cacheBust: Date.now() });

  if (window.fetch) {
    const controller = window.AbortController ? new AbortController() : null;
    const timeoutId = window.setTimeout(function() {
      if (controller) controller.abort();
    }, 8000);

    return fetch(APPS_SCRIPT_URL + '?' + query.toString(), {
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    })
      .then(function(response) {
        if (!response.ok) throw new Error('Google Sheet request failed.');
        return response.json();
      })
      .then(function(data) {
        if (!data || !data.ok) throw new Error((data && data.message) || 'Request failed.');
        return data;
      })
      .catch(function() {
        return callApiJsonp(params);
      })
      .finally(function() {
        window.clearTimeout(timeoutId);
      });
  }

  return callApiJsonp(params);
}

function callApiJsonp(params) {
  return new Promise(function(resolve, reject) {
    if (!APPS_SCRIPT_URL) {
      reject(new Error('Apps Script URL is missing.'));
      return;
    }

    const callback = 'kgbiCallback_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    const script = document.createElement('script');
    const query = new URLSearchParams({ ...params, callback, cacheBust: Date.now() });
    let timeoutId = 0;

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callback];
      script.remove();
    }

    window[callback] = function(data) {
      cleanup();
      data && data.ok ? resolve(data) : reject(new Error((data && data.message) || 'Request failed.'));
    };

    script.onerror = function() {
      cleanup();
      reject(new Error('Cannot connect to Google Sheet. Please refresh the page and make sure the latest GitHub files are published.'));
    };

    timeoutId = window.setTimeout(function() {
      cleanup();
      reject(new Error('Google Sheet is taking too long to respond. Please refresh and try again.'));
    }, 12000);

    script.src = APPS_SCRIPT_URL + '?' + query.toString();
    document.body.appendChild(script);
  });
}

function setMessage(message) {
  document.getElementById('statusMessage').textContent = message;
}

function showResultOverlay(title, text, details, isLoading, resultType) {
  const overlay = document.getElementById('resultOverlay');
  const overlayText = document.getElementById('overlayText');
  document.getElementById('overlayLabel').textContent = title === 'Connecting'
    ? 'Connecting'
    : isLoading
      ? 'Saving Result'
      : 'Result Saved';
  document.getElementById('overlayTitle').textContent = title;
  overlayText.textContent = text;
  overlayText.className = resultType ? 'overlay-result-text is-' + resultType.toLowerCase().replace(/_/g, '-') : 'overlay-result-text';
  document.getElementById('overlayDetails').innerHTML = details || '';
  overlay.classList.toggle('is-loading', Boolean(isLoading));
  overlay.classList.remove('hidden');

  window.clearTimeout(showResultOverlay.timer);
  if (!isLoading) {
    showResultOverlay.timer = window.setTimeout(function() {
      overlay.classList.add('hidden');
    }, 2600);
  }
}

function showMonitor(date) {
  selectedDate = date;
  localStorage.setItem('kgbiPageMode', 'monitor');
  document.getElementById('selectedDateTitle').textContent = date;
  document.getElementById('homeView').classList.add('hidden');
  document.getElementById('workflowView').classList.add('hidden');
  document.getElementById('overallView').classList.add('hidden');
  document.getElementById('monitorView').classList.remove('hidden');
  setActiveView('fights');
  savePageState();
  loadDateData(true);
}

function showHome() {
  clearPageState();
  document.getElementById('homeView').classList.remove('hidden');
  document.getElementById('workflowView').classList.remove('hidden');
  document.getElementById('monitorView').classList.add('hidden');
  document.getElementById('overallView').classList.add('hidden');
}

function showPasswordPrompt(date) {
  pendingProtectedDate = date;
  document.getElementById('passwordInput').value = '';
  document.getElementById('passwordError').textContent = '';
  document.getElementById('passwordOverlay').classList.remove('hidden');
  document.getElementById('passwordInput').focus();
}

function submitPassword() {
  const value = document.getElementById('passwordInput').value;
  if (value !== DECLARATION_PASSWORD) {
    document.getElementById('passwordError').textContent = 'Incorrect password';
    return;
  }

  document.getElementById('passwordOverlay').classList.add('hidden');
  showMonitor(pendingProtectedDate);
}

function showOverall() {
  selectedDate = '';
  localStorage.removeItem('kgbiSelectedDate');
  localStorage.removeItem('kgbiCurrentView');
  localStorage.removeItem('kgbiCurrentFightIndex');
  localStorage.setItem('kgbiPageMode', 'overall');
  document.getElementById('homeView').classList.add('hidden');
  document.getElementById('workflowView').classList.add('hidden');
  document.getElementById('monitorView').classList.add('hidden');
  document.getElementById('overallView').classList.remove('hidden');
  loadOverallData(selectedOverallDate);
}

function setActiveView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(function(button) {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  document.getElementById('fightList').classList.toggle('hidden', view !== 'fights');
  document.getElementById('resultList').classList.toggle('hidden', view !== 'results');
  document.getElementById('summaryList').classList.toggle('hidden', view !== 'summary');
  savePageState();
  applySearch();
}

function getFilteredFights() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();

  if (!query) return fights;

  return fights.filter(function(fight) {
    return [
      fight.fightNumber,
      fight.left.entryName,
      fight.left.wb,
      fight.left.weight,
      fight.right.entryName,
      fight.right.wb,
      fight.right.weight,
      resultLabel(findResult(fight.fightNumber))
    ].join(' ').toLowerCase().includes(query);
  });
}

function findResult(fightNumber) {
  return results.find(function(item) {
    return String(item.fightNumber) === String(fightNumber);
  });
}

function resultLabel(result) {
  if (!result) return 'PENDING';
  if (result.result === 'LEFT_WIN') return 'LEFT WIN';
  if (result.result === 'RIGHT_WIN') return 'RIGHT WIN';
  if (result.result === 'DRAW') return 'DRAW';
  if (result.result === 'CANCEL') return 'CANCELLED';
  return 'PENDING';
}

function formatResultCode(value) {
  if (value === 'CANCEL') return 'CANCELLED';
  return String(value || 'PENDING').replace(/_/g, ' ');
}

function sideBadge(saved, side) {
  if (!saved) return '';

  let label = '';
  let type = '';

  if (saved.result === 'LEFT_WIN') {
    label = side === 'left' ? 'W' : 'L';
    type = side === 'left' ? 'win' : 'loss';
  }

  if (saved.result === 'RIGHT_WIN') {
    label = side === 'right' ? 'W' : 'L';
    type = side === 'right' ? 'win' : 'loss';
  }

  if (saved.result === 'DRAW') {
    label = 'D';
    type = 'draw';
  }

  if (saved.result === 'CANCEL') {
    label = 'C';
    type = 'cancel';
  }

  return label ? `<span class="side-badge side-badge-${type}">${label}</span>` : '';
}

function createFightCard(fight, total, position) {
  const saved = findResult(fight.fightNumber);

  return `
    <article class="fight-card">
      <header class="fight-card-header">
        <div class="fight-title-wrap">
          <span>FIGHT #${escapeHtml(fight.fightNumber)}</span>
          <i></i>
        </div>
        <strong class="${saved ? 'status-done' : 'status-pending'}">${escapeHtml(saved ? formatResultCode(saved.result) : 'PENDING')}</strong>
      </header>

      <div class="matchup">
        <section class="fighter fighter-left">
          <p class="side-label">Left Entry</p>
          <h3>${sideBadge(saved, 'left')}${escapeHtml(fight.left.entryName || '-')}</h3>
          <div class="meta-row">
            <span>WB ${escapeHtml(fight.left.wb || '-')}</span>
            <span>WT ${escapeHtml(fight.left.weight || '-')}</span>
          </div>
        </section>

        <div class="vs-mark">VS</div>

        <section class="fighter fighter-right">
          <p class="side-label">Right Entry</p>
          <h3>${escapeHtml(fight.right.entryName || '-')}${sideBadge(saved, 'right')}</h3>
          <div class="meta-row">
            <span>WB ${escapeHtml(fight.right.wb || '-')}</span>
            <span>WT ${escapeHtml(fight.right.weight || '-')}</span>
          </div>
        </section>
      </div>

      <div class="action-grid">
        <button class="result-button win-left" type="button" data-result="LEFT_WIN" data-fight="${escapeHtml(fight.fightNumber)}" ${isSaving ? 'disabled' : ''}>Left Win</button>
        <button class="result-button draw" type="button" data-result="DRAW" data-fight="${escapeHtml(fight.fightNumber)}" ${isSaving ? 'disabled' : ''}>Draw</button>
        <button class="result-button win-right" type="button" data-result="RIGHT_WIN" data-fight="${escapeHtml(fight.fightNumber)}" ${isSaving ? 'disabled' : ''}>Right Win</button>
        <button class="result-button cancel" type="button" data-result="CANCEL" data-fight="${escapeHtml(fight.fightNumber)}" ${isSaving ? 'disabled' : ''}>Cancel</button>
      </div>

      <footer class="fight-card-footer">
        <span>FIGHT ${escapeHtml(position)} OF ${escapeHtml(total)}</span>
      </footer>
    </article>
  `;
}

function renderFights() {
  const list = document.getElementById('fightList');
  const visibleFights = getFilteredFights();

  if (isLoading) {
    list.innerHTML = '';
    return;
  }

  if (!visibleFights.length) {
    list.innerHTML = '<div class="state-msg">No matching fight found.</div>';
    return;
  }

  if (currentFightIndex >= visibleFights.length) currentFightIndex = visibleFights.length - 1;
  if (currentFightIndex < 0) currentFightIndex = 0;

  list.innerHTML = `
    ${createFightCard(visibleFights[currentFightIndex], visibleFights.length, currentFightIndex + 1)}
    <div class="fight-nav">
      <button class="button button-secondary" type="button" data-carousel="previous" ${currentFightIndex === 0 ? 'disabled' : ''}>Previous</button>
      <button class="button button-secondary" type="button" data-carousel="next" ${currentFightIndex === visibleFights.length - 1 ? 'disabled' : ''}>Next</button>
    </div>
  `;
}

function renderResults() {
  const list = document.getElementById('resultList');
  if (!results.length) {
    list.innerHTML = '<div class="state-msg">No declared results yet.</div>';
    return;
  }

  list.innerHTML = results.map(function(row) {
    return `
      <article class="result-card" data-search="${escapeHtml([row.fightNumber, row.leftEntry, row.rightEntry, row.result, row.winner].join(' ').toLowerCase())}">
        <header class="result-card-header">
          <p class="date-label">Fight #${escapeHtml(row.fightNumber)}</p>
          <span class="result-pill">${escapeHtml(formatResultCode(row.result))}</span>
        </header>

        <div class="result-matchup">
          <span>${escapeHtml(row.leftEntry || '-')}</span>
          <b>VS</b>
          <span>${escapeHtml(row.rightEntry || '-')}</span>
        </div>

        <div class="result-winner">
          <small>${row.result === 'DRAW' || row.result === 'CANCEL' ? 'Outcome' : 'Winner'}</small>
          <strong>${escapeHtml(row.winner || resultLabel(row))}</strong>
        </div>
      </article>
    `;
  }).join('');
}

function summarizeResults() {
  const summary = {};

  results.forEach(function(row) {
    [
      { name: row.leftEntry, side: 'LEFT' },
      { name: row.rightEntry, side: 'RIGHT' }
    ].forEach(function(entry) {
      if (!entry.name) return;
      const key = entry.name.trim().toUpperCase();
      if (!summary[key]) summary[key] = { name: entry.name, win: 0, loss: 0, draw: 0, cancel: 0 };

      if (row.result === 'DRAW') summary[key].draw++;
      if (row.result === 'CANCEL') summary[key].cancel++;
      if (row.result === 'LEFT_WIN') entry.side === 'LEFT' ? summary[key].win++ : summary[key].loss++;
      if (row.result === 'RIGHT_WIN') entry.side === 'RIGHT' ? summary[key].win++ : summary[key].loss++;
    });
  });

  return Object.values(summary).sort(function(a, b) {
    const aPoints = a.win + (a.draw * 0.5);
    const bPoints = b.win + (b.draw * 0.5);
    if (bPoints !== aPoints) return bPoints - aPoints;
    return a.name.localeCompare(b.name);
  });
}

function plural(count, label) {
  if (!count) return '';
  return count + ' ' + label + (count > 1 ? 's' : '');
}

function summaryTokens(row) {
  const tokens = [];
  for (let i = 0; i < row.win; i++) tokens.push('1');
  for (let i = 0; i < row.loss; i++) tokens.push('0');
  for (let i = 0; i < row.draw; i++) tokens.push('1/2');
  for (let i = 0; i < row.cancel; i++) tokens.push('C');
  return tokens;
}

function summaryPoints(row) {
  const points = row.win + (row.draw * 0.5);
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

function renderSummary() {
  const rows = summarizeResults();
  const list = document.getElementById('summaryList');
  if (!rows.length) {
    list.innerHTML = '<div class="state-msg">No summary yet.</div>';
    return;
  }

  list.innerHTML = rows.map(function(row) {
    return `
      <article class="summary-card" data-search="${escapeHtml(row.name.toLowerCase())}">
        <div class="summary-points">
          <small>Points</small>
          <strong>${escapeHtml(summaryPoints(row))}</strong>
        </div>
        <div class="summary-body">
          <h3>${escapeHtml(row.name)}</h3>
          <div class="summary-sequence">
            ${(summaryTokens(row).length ? summaryTokens(row) : ['-']).map(function(token) {
              return `<span>${escapeHtml(token)}</span>`;
            }).join('')}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function scoreClass(score) {
  if (score.isInitial) return 'score-initial';
  if (score.value === 'C') return 'score-cancel';
  return '';
}

function renderOverall() {
  const query = document.getElementById('overallSearchInput').value.trim().toLowerCase();
  const rows = overallRows.filter(function(row) {
    return !query || [row.entryName, row.owner].join(' ').toLowerCase().includes(query);
  });
  const list = document.getElementById('overallList');

  if (!rows.length) {
    list.innerHTML = '<div class="state-msg">No overall result found.</div>';
    return;
  }

  list.innerHTML = rows.map(function(row) {
    return `
      <article class="overall-result-card" data-search="${escapeHtml([row.entryName, row.owner].join(' ').toLowerCase())}">
        <div class="summary-points">
          <small>Points</small>
          <strong>${escapeHtml(row.points)}</strong>
        </div>
        <div class="summary-body">
          <h3>${escapeHtml(row.entryName || '-')}</h3>
          <p class="overall-owner">${escapeHtml(row.owner || '-')}</p>
          <div class="summary-sequence">
            ${row.scores.map(function(score) {
              return `<span class="${scoreClass(score)}">${escapeHtml(score.value || '-')}</span>`;
            }).join('')}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function loadOverallData(date) {
  selectedOverallDate = date;
  localStorage.setItem('kgbiPageMode', 'overall');
  localStorage.setItem('kgbiOverallDate', date);
  overallRows = [];
  document.querySelectorAll('[data-overall-date]').forEach(function(button) {
    button.classList.toggle('is-active', button.dataset.overallDate === date);
  });
  document.getElementById('overallStatusMessage').textContent = '';
  showResultOverlay('Connecting', 'Overall Results', '', true);

  callApi({ action: 'getOverall', date })
    .then(function(data) {
      overallRows = data.overall || [];
      document.getElementById('resultOverlay').classList.add('hidden');
      renderOverall();
    })
    .catch(function(error) {
      document.getElementById('resultOverlay').classList.add('hidden');
      document.getElementById('overallStatusMessage').textContent = error.message;
      renderOverall();
    });
}

function renderAll(message) {
  renderFights();
  renderResults();
  renderSummary();
  setMessage(message || (fights.length ? '' : 'No fights found.'));
}

function loadDateData(resetIndex) {
  isLoading = true;
  fights = [];
  results = [];
  if (resetIndex) currentFightIndex = 0;
  setMessage('');
  showResultOverlay('Connecting', 'Google Sheet for ' + selectedDate, '', true);
  renderFights();

  callApi({ action: 'getDate', date: selectedDate })
    .then(function(data) {
      isLoading = false;
      fights = data.fights || [];
      results = data.results || [];
      document.getElementById('resultOverlay').classList.add('hidden');
      renderAll();
    })
    .catch(function(error) {
      isLoading = false;
      document.getElementById('resultOverlay').classList.add('hidden');
      renderAll(error.message);
    });
}

function saveResult(fightNumber, result) {
  if (isSaving) return;

  const fight = fights.find(function(item) {
    return String(item.fightNumber) === String(fightNumber);
  });
  if (!fight) return;
  const label = resultLabel({ result });

  isSaving = true;
  renderFights();
  setMessage('');
  showResultOverlay('Saving Fight #' + fightNumber, label, '', true, result);

  callApi({ action: 'saveResult', date: selectedDate, fightNumber, result, password: DECLARATION_PASSWORD })
    .then(function(data) {
      isSaving = false;
      results = data.results || results;
      renderAll();
      showResultOverlay('Fight #' + fightNumber, label, createOverlayDetails(fight, result), false, result);
    })
    .catch(function(error) {
      isSaving = false;
      renderFights();
      setMessage(error.message);
      document.getElementById('resultOverlay').classList.add('hidden');
    });
}

function createOverlayDetails(fight, result) {
  const left = fight.left;
  const right = fight.right;
  const winner = result === 'LEFT_WIN' ? left : result === 'RIGHT_WIN' ? right : null;

  if (result === 'DRAW' || result === 'CANCEL') {
    const resultClass = result === 'DRAW' ? 'overlay-draw-result' : 'overlay-cancel-result';
    return `
      <div class="overlay-match overlay-even-result ${resultClass}">
        <div>
          <small>${escapeHtml(resultLabel({ result }))}</small>
          <strong>${escapeHtml(left.entryName || '-')}</strong>
          <span>WB ${escapeHtml(left.wb || '-')} | WT ${escapeHtml(left.weight || '-')}</span>
        </div>
        <div>
          <small>${escapeHtml(resultLabel({ result }))}</small>
          <strong>${escapeHtml(right.entryName || '-')}</strong>
          <span>WB ${escapeHtml(right.wb || '-')} | WT ${escapeHtml(right.weight || '-')}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="overlay-match overlay-winner-only">
      <div>
        <small>Winner</small>
        <strong>${escapeHtml(winner.entryName || '-')}</strong>
        <span>WB ${escapeHtml(winner.wb || '-')} | WT ${escapeHtml(winner.weight || '-')}</span>
      </div>
    </div>
  `;
}

function applySearch() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  if (currentView === 'fights') {
    currentFightIndex = 0;
    renderFights();
    return;
  }

  const activeList = currentView === 'fights' ? 'fightList' : currentView === 'results' ? 'resultList' : 'summaryList';
  document.querySelectorAll('#' + activeList + ' [data-search]').forEach(function(item) {
    item.classList.toggle('hidden', query && !item.dataset.search.includes(query));
  });
}

document.querySelectorAll('[data-open-date]').forEach(function(button) {
  button.addEventListener('click', function() {
    showPasswordPrompt(button.dataset.openDate);
  });
});

document.getElementById('openOverallButton').addEventListener('click', showOverall);
document.getElementById('overallBackButton').addEventListener('click', showHome);
document.getElementById('submitPasswordButton').addEventListener('click', submitPassword);
document.getElementById('cancelPasswordButton').addEventListener('click', function() {
  document.getElementById('passwordOverlay').classList.add('hidden');
});
document.getElementById('passwordInput').addEventListener('keydown', function(event) {
  if (event.key === 'Enter') submitPassword();
});
document.getElementById('overallSearchInput').addEventListener('input', renderOverall);

document.querySelectorAll('[data-overall-date]').forEach(function(button) {
  button.addEventListener('click', function() {
    loadOverallData(button.dataset.overallDate);
  });
});

document.querySelectorAll('[data-view]').forEach(function(button) {
  button.addEventListener('click', function() {
    setActiveView(button.dataset.view);
  });
});

document.getElementById('backButton').addEventListener('click', showHome);
document.getElementById('searchInput').addEventListener('input', applySearch);

document.addEventListener('click', function(event) {
  const navButton = event.target.closest('[data-carousel]');
  if (navButton) {
    currentFightIndex += navButton.dataset.carousel === 'next' ? 1 : -1;
    savePageState();
    renderFights();
    return;
  }

  const button = event.target.closest('[data-result]');
  if (button) saveResult(button.dataset.fight, button.dataset.result);
});

function restorePageState() {
  const savedMode = localStorage.getItem('kgbiPageMode');
  if (savedMode === 'overall') {
    selectedOverallDate = localStorage.getItem('kgbiOverallDate') || 'September 1';
    document.getElementById('homeView').classList.add('hidden');
    document.getElementById('workflowView').classList.add('hidden');
    document.getElementById('monitorView').classList.add('hidden');
    document.getElementById('overallView').classList.remove('hidden');
    loadOverallData(selectedOverallDate);
    return;
  }

  const savedDate = localStorage.getItem('kgbiSelectedDate');
  const savedView = localStorage.getItem('kgbiCurrentView') || 'fights';
  const savedIndex = Number(localStorage.getItem('kgbiCurrentFightIndex') || 0);

  if (!savedDate) return;

  selectedDate = savedDate;
  currentView = savedView;
  currentFightIndex = Number.isFinite(savedIndex) ? savedIndex : 0;
  document.getElementById('selectedDateTitle').textContent = savedDate;
  document.getElementById('homeView').classList.add('hidden');
  document.getElementById('workflowView').classList.add('hidden');
  document.getElementById('monitorView').classList.remove('hidden');
  setActiveView(savedView);
  loadDateData(false);
}

restorePageState();
