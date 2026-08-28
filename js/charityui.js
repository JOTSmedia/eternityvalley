// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — the charitable layer, on screen
//
// Campaigns, donations, and the public ledger. Kept out of ui.js
// because it is a self-contained surface, and takes `ui` as an
// argument rather than importing it — ui.js imports this, and a module
// cycle here would be a slow, confusing bug for no benefit.
//
// The organising idea: a campaign needs no plot, no membership and no
// account. Grief does not wait for a credit card, and the cheapest way
// to be trusted with money is to ask for none of it first.
// ============================================================
import { icon } from './icons.js';
import { Auth } from './auth.js';
import { checkout } from './checkout.js';
import {
  CHARITIES, charityById, charityName, Ledger, Campaigns,
  SPLITS, PROCESSOR, split, fmt, toCents,
} from './charity.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (n) => Math.round(n * 100) + '%';
const when = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// Suggested amounts, in cents. Small enough that giving is a reflex.
const PRESETS = [500, 1000, 2500, 5000];

export const CharityUI = {

  // ---------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------
  togglePanel(ui) {
    const p = document.getElementById('campaignPanel');
    if (!p) return;
    if (!p.classList.contains('hidden')) return p.classList.add('hidden');
    document.getElementById('feedPanel')?.classList.add('hidden');
    document.getElementById('browsePanel')?.classList.add('hidden');
    this.renderPanel(ui);
    p.classList.remove('hidden');
  },

  renderPanel(ui) {
    const list = Campaigns.load();
    const t = Ledger.totals();
    const body = document.getElementById('campaignBody');
    if (!body) return;

    body.innerHTML = `
      <div class="cause-hero">
        <div class="cause-hero__fig">${fmt(t.charity)}</div>
        <div class="cause-hero__cap">Raised for animal charities, all-time</div>
        <button class="btn btn-outline btn-block" id="openLedger">
          ${icon('scroll')} See where every cent went
        </button>
      </div>

      <button class="btn btn-gold btn-block" id="newCampaign">
        ${icon('heart')} Start a campaign in their name
      </button>
      <p class="fine" style="margin:8px 0 4px">
        Free, and always free. No plot, no membership, no account needed —
        100% of what a campaign raises goes to the charity you pick.</p>

      ${list.length ? `<div class="sub" style="margin-top:16px">Campaigns (${list.length})</div>` : `
        <div class="cause-empty">
          ${icon('paw', { size: 30 })}
          <p>No campaigns yet. The first one could be yours.</p>
        </div>`}

      ${list.map(c => {
        const raised = Campaigns.raised(c);
        const p = Campaigns.progress(c);
        return `
        <div class="cause-card" data-cmp="${c.id}">
          <div class="cause-card__top">
            <b>${esc(c.petName)}</b>
            <span class="cause-card__for">${esc(charityName(c.charityId) || '')}</span>
          </div>
          ${c.story ? `<p class="cause-card__story">${esc(c.story.slice(0, 130))}${c.story.length > 130 ? '…' : ''}</p>` : ''}
          <div class="cause-bar"><span style="width:${(p * 100).toFixed(1)}%"></span></div>
          <div class="cause-card__foot">
            <span><b>${fmt(raised)}</b> of ${fmt(c.goalCents)}</span>
            <span>${(c.donations || []).length} ${(c.donations || []).length === 1 ? 'gift' : 'gifts'}</span>
          </div>
          <button class="btn btn-gold btn-block cause-give" data-give="${c.id}">${icon('heart')} Give in ${esc(c.petName)}’s name</button>
        </div>`;
      }).join('')}`;

    body.querySelector('#newCampaign').onclick = () => this.createModal(ui);
    body.querySelector('#openLedger').onclick = () => this.ledgerModal(ui);
    body.querySelectorAll('[data-give]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const c = Campaigns.get(b.dataset.give);
        if (c) this.donateModal(ui, c);
      };
    });
    body.querySelectorAll('[data-cmp]').forEach(el => {
      el.onclick = () => {
        const c = Campaigns.get(el.dataset.cmp);
        if (c) this.campaignModal(ui, c);
      };
    });
  },

  createModal(ui) {
    ui.modal(`
      <h2>${icon('heart')} Start a campaign</h2>
      <div class="modal-sub">In your companion’s name. It costs nothing to run,
        and every cent it raises goes to the charity you choose — we take none of it.</div>

      <label>Their name</label>
      <input id="cmpName" maxlength="40" placeholder="Bear">

      <div class="two-col">
        <div>
          <label>Species</label>
          <input id="cmpSpecies" maxlength="24" placeholder="Dog">
        </div>
        <div>
          <label>Years</label>
          <input id="cmpYears" maxlength="20" placeholder="2011 – 2024">
        </div>
      </div>

      <label>Their story <span class="fine-inline">(what should people know?)</span></label>
      <textarea id="cmpStory" maxlength="600" rows="4"
        placeholder="Bear was pulled out of a shelter at seven years old and got five more good ones…"></textarea>

      <label>Who should the money go to?</label>
      <select id="cmpCharity">
        ${CHARITIES.map(c => `<option value="${c.id}">${esc(c.name)} — ${esc(c.cat)}</option>`).join('')}
      </select>
      <p class="fine" id="cmpCharityNote"></p>

      <label>Goal</label>
      <select id="cmpGoal">
        <option value="10000">$100</option>
        <option value="25000" selected>$250</option>
        <option value="50000">$500</option>
        <option value="100000">$1,000</option>
        <option value="250000">$2,500</option>
      </select>

      <button class="btn btn-gold btn-block" id="cmpCreate">Create the campaign</button>
      <p class="fine">${this._demoNote()}</p>`);

    const box = document.getElementById('modalBox');
    const sel = box.querySelector('#cmpCharity');
    const note = box.querySelector('#cmpCharityNote');
    const describe = () => {
      const c = charityById(sel.value);
      note.innerHTML = c
        ? `${esc(c.blurb)} <br><span class="fine-dim">EIN ${esc(c.ein)} · <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.url.replace(/^https?:\/\//, ''))}</a></span>`
        : '';
    };
    sel.onchange = describe; describe();

    box.querySelector('#cmpCreate').onclick = () => {
      const name = box.querySelector('#cmpName').value.trim();
      if (!name) return ui.toast('Their name, first.', 'warning');
      if (!Auth.user) Auth.continueAsGuest(true);
      const c = Campaigns.create({
        petName: name,
        species: box.querySelector('#cmpSpecies').value.trim(),
        years: box.querySelector('#cmpYears').value.trim(),
        story: box.querySelector('#cmpStory').value.trim(),
        charityId: sel.value,
        goalCents: +box.querySelector('#cmpGoal').value,
        owner: Auth.user?.name || 'A friend',
      });
      ui.closeModal();
      this.renderPanel(ui);
      document.getElementById('campaignPanel')?.classList.remove('hidden');
      ui.toast(`${c.petName}’s campaign is live.`, 'heart');
      this.campaignModal(ui, c);
    };
  },

  campaignModal(ui, c) {
    const raised = Campaigns.raised(c);
    const p = Campaigns.progress(c);
    const ch = charityById(c.charityId);
    const gifts = (c.donations || []).slice().reverse();
    ui.modal(`
      <h2>${esc(c.petName)}</h2>
      <div class="modal-sub">${[c.species, c.years].filter(Boolean).map(esc).join(' · ') || 'In loving memory'}</div>
      ${c.story ? `<p class="cause-story">${esc(c.story)}</p>` : ''}

      <div class="cause-bar cause-bar--lg"><span style="width:${(p * 100).toFixed(1)}%"></span></div>
      <div class="cause-figs">
        <div><b>${fmt(raised)}</b><span>reached the charity</span></div>
        <div><b>${fmt(c.goalCents)}</b><span>goal</span></div>
        <div><b>${gifts.length}</b><span>${gifts.length === 1 ? 'giver' : 'givers'}</span></div>
      </div>

      ${ch ? `<div class="district-blurb">
        ${icon('heart')} Every cent goes to <b>${esc(ch.name)}</b> — ${esc(ch.blurb)}
        <br><span class="fine-dim">EIN ${esc(ch.ein)} · <a href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer">verify independently</a></span>
      </div>` : ''}

      <button class="btn btn-gold btn-block" id="cmpGive">${icon('heart')} Give in ${esc(c.petName)}’s name</button>

      ${gifts.length ? `<div class="shop-cat">Who has given</div>
        ${gifts.map(d => `
          <div class="feed-item">
            <div class="fi-icon">${icon('heart')}</div>
            <div><b>${esc(d.donor)}</b> · ${fmt(d.gross)}
              ${d.message ? `<br><i>“${esc(d.message)}”</i>` : ''}
              <span class="fi-time">${when(d.at)} · ledger #${d.seq}</span></div>
          </div>`).join('')}` : ''}

      <p class="fine">${this._demoNote()}</p>`);

    document.getElementById('modalBox').querySelector('#cmpGive').onclick = () => this.donateModal(ui, c);
  },

  donateModal(ui, c) {
    const ch = charityById(c.charityId);
    ui.modal(`
      <h2>${icon('heart')} Give in ${esc(c.petName)}’s name</h2>
      <div class="modal-sub">To <b>${esc(ch?.name || 'the chosen charity')}</b>. We take nothing —
        the only deduction is the card fee, and we show it to you below.</div>

      <div class="give-row">
        ${PRESETS.map((v, i) => `<button class="give-chip${i === 1 ? ' is-on' : ''}" data-amt="${v}">${fmt(v)}</button>`).join('')}
      </div>
      <label>Or another amount</label>
      <input id="giveOther" inputmode="decimal" placeholder="25.00">

      <div class="give-break" id="giveBreak"></div>

      <label>Your name <span class="fine-inline">(optional)</span></label>
      <input id="giveName" maxlength="40" placeholder="${esc(Auth.user?.name || 'Anonymous')}">
      <label>A message for the family <span class="fine-inline">(optional)</span></label>
      <input id="giveMsg" maxlength="120" placeholder="Thinking of you both.">

      <button class="btn btn-gold btn-block" id="giveGo">Give</button>
      <p class="fine">${this._demoNote()}</p>`);

    const box = document.getElementById('modalBox');
    let cents = PRESETS[1];

    const paint = () => {
      const s = split('donation', cents);
      box.querySelector('#giveBreak').innerHTML = `
        <div class="give-break__row"><span>You give</span><b>${fmt(s.gross)}</b></div>
        <div class="give-break__row is-fee"><span>${esc(PROCESSOR.name)}</span><b>−${fmt(s.processor)}</b></div>
        <div class="give-break__row is-fee"><span>Our cut</span><b>${fmt(0)}</b></div>
        <div class="give-break__row is-total"><span>Reaches ${esc(ch?.name || 'the charity')}</span><b>${fmt(s.charity)}</b></div>`;
    };
    paint();

    box.querySelectorAll('[data-amt]').forEach(b => {
      b.onclick = () => {
        box.querySelectorAll('[data-amt]').forEach(x => x.classList.remove('is-on'));
        b.classList.add('is-on');
        box.querySelector('#giveOther').value = '';
        cents = +b.dataset.amt;
        paint();
      };
    });
    box.querySelector('#giveOther').oninput = (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v) && v > 0) {
        box.querySelectorAll('[data-amt]').forEach(x => x.classList.remove('is-on'));
        cents = toCents(v);
        paint();
      }
    };

    box.querySelector('#giveGo').onclick = async (e) => {
      const btn = e.currentTarget;
      if (cents < 100) return ui.toast('A dollar is the smallest we can process.', 'warning');
      const donor = box.querySelector('#giveName').value.trim() || Auth.user?.name || 'Anonymous';
      const message = box.querySelector('#giveMsg').value.trim();
      btn.disabled = true; btn.style.opacity = .5; btn.textContent = 'Giving…';
      try {
        // Goes through checkout so it is booked exactly like every
        // other payment, then attaches itself to the campaign.
        const r = await checkout({
          kind: 'donation',
          name: `Donation in memory of ${c.petName}`,
          amount: cents / 100,
          meta: { charity: c.charityId, campaignId: c.id },
        });
        if (!r.ok) return;
        if (!Auth.user) Auth.continueAsGuest(true);
        const entry = r.entry;
        c.donations.push({
          at: entry?.at || Date.now(), donor, message,
          gross: entry?.gross ?? cents,
          charity: entry?.charity ?? cents,
          seq: entry?.seq ?? 0,
        });
        Campaigns._persist();
        ui.closeModal();
        this.renderPanel(ui);
        ui.toast(`${fmt(entry?.charity ?? cents)} on its way to ${charityName(c.charityId)} — thank you.`, 5200, 'heart');
        this.thanksModal(ui, c, entry);
      } catch (err) {
        ui.toast(String(err.message), 'warning');
        btn.disabled = false; btn.style.opacity = 1; btn.textContent = 'Give';
      }
    };
  },

  /** The receipt. Shown immediately, and findable forever in the ledger. */
  thanksModal(ui, c, entry) {
    if (!entry) return;
    ui.modal(`
      <h2>${icon('dove')} Thank you</h2>
      <div class="modal-sub">In memory of ${esc(c.petName)}.</div>
      <div class="give-break">
        <div class="give-break__row"><span>You gave</span><b>${fmt(entry.gross)}</b></div>
        <div class="give-break__row is-fee"><span>Card processing</span><b>−${fmt(entry.processor)}</b></div>
        <div class="give-break__row is-total"><span>To ${esc(charityName(c.charityId))}</span><b>${fmt(entry.charity)}</b></div>
      </div>
      <p class="fine" style="margin-top:12px">
        This is entry <b>#${entry.seq}</b> in the public ledger, recorded ${when(entry.at)}.
        It cannot be edited without breaking the record — that is the point of it.</p>
      <button class="btn btn-outline btn-block" id="thanksLedger">${icon('scroll')} See it in the ledger</button>
      <p class="fine">${this._demoNote()}</p>`);
    document.getElementById('modalBox').querySelector('#thanksLedger').onclick = () => this.ledgerModal(ui);
  },

  // ---------------------------------------------------------------
  // The ledger, in public
  // ---------------------------------------------------------------
  async ledgerModal(ui) {
    const t = Ledger.totals();
    const entries = Ledger.load().slice().reverse();
    const check = await Ledger.verify();

    const byCharity = Object.entries(t.byCharity)
      .sort((a, b) => b[1] - a[1])
      .map(([id, cents]) => ({ name: charityName(id) || id, cents }));

    ui.modal(`
      <h2>${icon('scroll')} Where the money goes</h2>
      <div class="modal-sub">Every transaction this site has ever taken, what was deducted,
        and what reached a charity. Nothing is summarised from memory — the figures below are
        added up from the entries underneath them, every time this opens.</div>

      <div class="ledger-tot">
        <div class="ledger-tot__big">
          <b>${fmt(t.charity)}</b><span>reached charities</span>
        </div>
        <div class="ledger-tot__grid">
          <div><b>${fmt(t.gross)}</b><span>taken in</span></div>
          <div><b>${fmt(t.processor)}</b><span>card fees</span></div>
          <div><b>${fmt(t.ops)}</b><span>ran the site</span></div>
          <div><b>${t.count}</b><span>transactions</span></div>
        </div>
      </div>

      <div class="ledger-check ${check.ok ? 'is-ok' : 'is-bad'}">
        ${icon(check.ok ? 'shield' : 'warning')}
        ${check.ok
          ? `Chain verified — all ${check.count} ${check.count === 1 ? 'entry' : 'entries'} intact, and every one balances.`
          : `Entry #${check.seq}: ${esc(check.why)}`}
      </div>

      ${byCharity.length ? `
        <div class="shop-cat">By charity</div>
        ${byCharity.map(c => `
          <div class="ledger-row">
            <span>${esc(c.name)}</span><b>${fmt(c.cents)}</b>
          </div>`).join('')}` : ''}

      <div class="shop-cat">How each kind of payment is split</div>
      <div class="ledger-splits">
        ${Object.entries(SPLITS).map(([k, r]) => `
          <div class="ledger-row">
            <span>${esc(r.label)}</span>
            <b>${pct(r.charity)} to charity</b>
          </div>`).join('')}
      </div>
      <p class="fine">Shares are of the amount left after the card processor
        (${(PROCESSOR.pct * 100).toFixed(1)}% + ${fmt(PROCESSOR.flat)}) takes its cut, so
        “100% to charity” means what it says. Rounding always favours the charity.</p>

      <div class="shop-cat">Every entry</div>
      ${entries.length ? `
        <div class="ledger-list">
          ${entries.map(e => `
            <div class="ledger-entry">
              <div class="ledger-entry__head">
                <b>#${e.seq}</b> ${esc(e.label)}
                <span>${when(e.at)}</span>
              </div>
              <div class="ledger-entry__nums">
                <span>in <b>${fmt(e.gross)}</b></span>
                <span>fee <b>${fmt(e.processor)}</b></span>
                <span class="is-good">charity <b>${fmt(e.charity)}</b></span>
                <span>ops <b>${fmt(e.ops)}</b></span>
              </div>
              <div class="ledger-entry__meta">
                ${e.charityId ? esc(charityName(e.charityId) || e.charityId) + ' · ' : ''}${esc(e.donor)}
                · <code>${esc(e.hash.slice(0, 12))}</code>
              </div>
            </div>`).join('')}
        </div>`
      : `<div class="cause-empty">${icon('scroll', { size: 28 })}<p>Nothing has been taken yet, so there is nothing to account for.</p></div>`}

      <button class="btn btn-outline btn-block" id="ledgerExport">${icon('book')} Download the full ledger (JSON)</button>
      <p class="fine">${this._demoNote()}</p>`);

    document.getElementById('modalBox').querySelector('#ledgerExport').onclick = () => {
      const blob = new Blob([Ledger.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rainbow-bridge-ledger.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      ui.toast('Ledger downloaded.', 'book');
    };
  },

  /**
   * The disclaimer, in one place. It is deliberately blunt: a page
   * about financial transparency that is coy about its own status
   * would be the wrong page.
   */
  _demoNote() {
    return 'This build takes no real payments and moves no real money. '
      + 'The charities listed are real and are named with their EIN so you can look them up, '
      + 'but none of them is affiliated with this site.';
  },
};

export default CharityUI;
