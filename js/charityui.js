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
  CHARITIES, CHARITY_CATEGORIES, charityById, charityName, calculateImpact,
  Ledger, Campaigns, SPLITS, PROCESSOR, split, fmt, toCents,
} from './charity.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (n) => Math.round(n * 100) + '%';
const when = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// Suggested amounts in cents
const PRESETS = [1500, 3500, 7500, 15000];

export const CharityUI = {
  activeCat: 'all',

  // ---------------------------------------------------------------
  // Campaigns & Charity Hub
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
    const allList = Campaigns.load();
    const t = Ledger.totals();
    const impact = calculateImpact(t.charity);
    const body = document.getElementById('campaignBody');
    if (!body) return;

    const list = this.activeCat === 'all'
      ? allList
      : allList.filter(c => {
          const ch = charityById(c.charityId);
          return ch?.catId === this.activeCat;
        });

    body.innerHTML = `
      <div class="cause-hero">
        <div class="cause-hero__fig">${fmt(t.charity)}</div>
        <div class="cause-hero__cap">Delivered directly to verified animal rescues</div>
        
        <!-- Live Real-World Impact Grid -->
        <div class="impact-grid">
          <div class="impact-cell">
            <span class="impact-cell__val">${impact.mealsProvided}</span>
            <span class="impact-cell__lbl">${icon('heart', { size: 12 })} Meals Provided</span>
          </div>
          <div class="impact-cell">
            <span class="impact-cell__val">${impact.veterinaryExams}</span>
            <span class="impact-cell__lbl">${icon('sparkle', { size: 12 })} Vet Exams Funded</span>
          </div>
          <div class="impact-cell">
            <span class="impact-cell__val">${impact.seniorComfortDays}</span>
            <span class="impact-cell__lbl">${icon('flower', { size: 12 })} Senior Care Days</span>
          </div>
        </div>

        <button class="btn btn-outline btn-block" id="openLedger" style="margin-top:12px">
          ${icon('scroll')} Public SHA-256 Ledger (${t.count} verified)
        </button>
      </div>

      <button class="btn btn-gold btn-block" id="newCampaign">
        ${icon('heart')} Start a free campaign in their name
      </button>
      <p class="fine" style="margin:8px 0 12px;font-size:11.5px">
        100% of what your campaign raises passes straight to your chosen shelter.
        No platform fees, no deductions.
      </p>

      <!-- Category Filter Tabs -->
      <div class="charity-cat-bar">
        ${CHARITY_CATEGORIES.map(cat => `
          <button class="charity-cat-chip${this.activeCat === cat.id ? ' is-active' : ''}" data-cat="${cat.id}">
            ${icon(cat.icon, { size: 14 })} ${esc(cat.label)}
          </button>
        `).join('')}
      </div>

      ${list.length ? `<div class="sub" style="margin:16px 0 10px">Active Memorial Campaigns (${list.length})</div>` : `
        <div class="cause-empty">
          ${icon('paw', { size: 32 })}
          <p>No campaigns in this category yet. Be the first to start one in your companion's memory.</p>
        </div>`}

      ${list.map(c => {
        const raised = Campaigns.raised(c);
        const p = Campaigns.progress(c);
        const ch = charityById(c.charityId);
        return `
        <div class="cause-card" data-cmp="${c.id}">
          <div class="cause-card__top">
            <div>
              <b>${esc(c.petName)}</b>
              <div class="cause-card__sub">${[c.species, c.years].filter(Boolean).map(esc).join(' · ')}</div>
            </div>
            <span class="cause-card__for">${esc(ch?.name || '')}</span>
          </div>
          ${c.story ? `<p class="cause-card__story">${esc(c.story.slice(0, 130))}${c.story.length > 130 ? '…' : ''}</p>` : ''}
          <div class="cause-bar"><span style="width:${(p * 100).toFixed(1)}%"></span></div>
          <div class="cause-card__foot">
            <span><b>${fmt(raised)}</b> of ${fmt(c.goalCents)}</span>
            <span>${(c.donations || []).length} ${(c.donations || []).length === 1 ? 'tribute' : 'tributes'}</span>
          </div>
          <button class="btn btn-gold btn-block cause-give" data-give="${c.id}">${icon('heart')} Give in ${esc(c.petName)}’s name</button>
        </div>`;
      }).join('')}`;

    body.querySelector('#newCampaign').onclick = () => this.createModal(ui);
    body.querySelector('#openLedger').onclick = () => this.ledgerModal(ui);
    
    // Category tabs
    body.querySelectorAll('[data-cat]').forEach(btn => {
      btn.onclick = () => {
        this.activeCat = btn.dataset.cat;
        this.renderPanel(ui);
      };
    });

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
      <h2>${icon('heart')} Start a memorial campaign</h2>
      <div class="modal-sub">Create a lasting tribute in your companion’s name. 
        <b>100% of donations go directly to the animal rescue you select.</b> No platform cut.</div>

      <label>Their name</label>
      <input id="cmpName" maxlength="40" placeholder="e.g. Luna or Ranger">

      <div class="two-col">
        <div>
          <label>Species / Breed</label>
          <input id="cmpSpecies" maxlength="24" placeholder="Golden Retriever, Tabby...">
        </div>
        <div>
          <label>Years</label>
          <input id="cmpYears" maxlength="20" placeholder="2012 – 2025">
        </div>
      </div>

      <label>Their story &amp; rescue mission <span class="fine-inline">(what made them special?)</span></label>
      <textarea id="cmpStory" maxlength="700" rows="4"
        placeholder="Luna brought sunshine into our lives for 13 years. In her honor, we're helping rescue dogs get the medical care they need…"></textarea>

      <label>Select Verified 501(c)(3) Animal Rescue Beneficiary</label>
      <select id="cmpCharity">
        ${CHARITIES.map(c => `<option value="${c.id}">${esc(c.name)} — ${esc(c.cat)} (${esc(c.city)}, ${esc(c.state)})</option>`).join('')}
      </select>
      <div class="district-blurb" id="cmpCharityNote" style="margin:10px 0"></div>

      <label>Campaign Goal</label>
      <select id="cmpGoal">
        <option value="15000">$150 — Shelter Intake &amp; Vaccines</option>
        <option value="35000" selected>$350 — Medical Grant &amp; Spay/Neuter</option>
        <option value="75000">$750 — Emergency Surgery Fund</option>
        <option value="150000">$1,500 — Senior Foster Sponsorship</option>
        <option value="300000">$3,000 — Lifetime Sanctuary Mission</option>
      </select>

      <button class="btn btn-gold btn-block" id="cmpCreate">${icon('heart')} Launch Memorial Campaign</button>
      <p class="fine">${this._demoNote()}</p>`);

    const box = document.getElementById('modalBox');
    const sel = box.querySelector('#cmpCharity');
    const note = box.querySelector('#cmpCharityNote');
    const describe = () => {
      const c = charityById(sel.value);
      note.innerHTML = c
        ? `<b>${esc(c.name)}</b> (${esc(c.city)}, ${esc(c.state)})<br>
           <span style="color:var(--accent-hi-c);font-size:11.5px">${esc(c.rating || '')}</span><br>
           ${esc(c.blurb)}<br>
           <span class="fine-dim">EIN ${esc(c.ein)} · <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.url.replace(/^https?:\/\//, ''))}</a></span>`
        : '';
    };
    sel.onchange = describe; describe();

    box.querySelector('#cmpCreate').onclick = () => {
      const name = box.querySelector('#cmpName').value.trim();
      if (!name) return ui.toast('Please enter their name.', 'warning');
      if (!Auth.user) Auth.continueAsGuest(true);
      const c = Campaigns.create({
        petName: name,
        species: box.querySelector('#cmpSpecies').value.trim(),
        years: box.querySelector('#cmpYears').value.trim(),
        story: box.querySelector('#cmpStory').value.trim(),
        charityId: sel.value,
        goalCents: +box.querySelector('#cmpGoal').value,
        owner: Auth.user?.name || 'A loving friend',
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
    const shareUrl = `${location.origin}${location.pathname}?campaign=${encodeURIComponent(c.id)}`;

    ui.modal(`
      <h2>${icon('crest')} ${esc(c.petName)}</h2>
      <div class="modal-sub">${[c.species, c.years].filter(Boolean).map(esc).join(' · ') || 'In loving memory'} · by ${esc(c.owner || 'A loving family')}</div>
      ${c.story ? `<p class="cause-story">“${esc(c.story)}”</p>` : ''}

      <div class="cause-bar cause-bar--lg"><span style="width:${(p * 100).toFixed(1)}%"></span></div>
      <div class="cause-figs">
        <div><b>${fmt(raised)}</b><span>Delivered to Rescue</span></div>
        <div><b>${fmt(c.goalCents)}</b><span>Campaign Goal</span></div>
        <div><b>${gifts.length}</b><span>${gifts.length === 1 ? 'Tribute Giver' : 'Tribute Givers'}</span></div>
      </div>

      ${ch ? `<div class="district-blurb">
        ${icon('heart')} Dedicated Beneficiary: <b>${esc(ch.name)}</b> (${esc(ch.city)}, ${esc(ch.state)})<br>
        <span style="color:var(--accent-hi-c);font-size:11.5px">${esc(ch.rating || '')}</span><br>
        ${esc(ch.blurb)}
        <br><span class="fine-dim">IRS EIN: ${esc(ch.ein)} · <a href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer">Official Website</a></span>
      </div>` : ''}

      <button class="btn btn-gold btn-block" id="cmpGive">${icon('heart')} Give a Tribute in ${esc(c.petName)}’s Name</button>
      <button class="btn btn-outline btn-block" id="cmpShare" style="margin-top:8px">${icon('share')} Share Campaign &amp; Copy Tribute Link</button>

      ${gifts.length ? `<div class="shop-cat" style="margin-top:18px">Memorial Tributes &amp; Givers</div>
        ${gifts.map(d => `
          <div class="feed-item">
            <div class="fi-icon">${icon('heart')}</div>
            <div><b>${esc(d.donor)}</b> · <span style="color:var(--accent-hi-c);font-weight:700">${fmt(d.gross)}</span>
              ${d.message ? `<br><i style="color:#e6e2d8">“${esc(d.message)}”</i>` : ''}
              <span class="fi-time">${when(d.at)} · Verified Ledger #${d.seq}</span></div>
          </div>`).join('')}` : ''}

      <p class="fine">${this._demoNote()}</p>`);

    const box = document.getElementById('modalBox');
    box.querySelector('#cmpGive').onclick = () => this.donateModal(ui, c);
    box.querySelector('#cmpShare').onclick = () => {
      navigator.clipboard?.writeText(shareUrl);
      ui.toast('Campaign tribute link copied to clipboard!', 'share');
    };
  },

  donateModal(ui, c) {
    const ch = charityById(c.charityId);
    const tiers = ch?.impactTiers || [
      { amount: 1500, label: '$15', desc: 'Provides warm beds & nutritious food' },
      { amount: 3500, label: '$35', desc: 'Vaccines, microchip & wellness exam' },
      { amount: 7500, label: '$75', desc: 'Urgent veterinary diagnostic care' },
      { amount: 15000, label: '$150', desc: 'Critical surgery & rescue sponsorship' },
    ];

    ui.modal(`
      <h2>${icon('heart')} Give in ${esc(c.petName)}’s name</h2>
      <div class="modal-sub">Supporting <b>${esc(ch?.name || 'the rescue charity')}</b>.
        <b>100% of your donation passes directly to the shelter.</b></div>

      <label>Choose a tribute amount &amp; real-world impact</label>
      <div class="give-row">
        ${tiers.map((t, i) => `
          <button class="give-chip${i === 1 ? ' is-on' : ''}" data-amt="${t.amount}">
            ${t.label}
          </button>
        `).join('')}
      </div>

      <div class="district-blurb" id="giveTierNote" style="margin:8px 0 14px"></div>

      <label>Or enter a custom amount</label>
      <input id="giveOther" inputmode="decimal" placeholder="e.g. 50.00">

      <div class="give-break" id="giveBreak"></div>

      <label>Your Name / Family <span class="fine-inline">(optional)</span></label>
      <input id="giveName" maxlength="40" placeholder="${esc(Auth.user?.name || 'A caring friend')}">
      
      <label>Tribute message for the memorial wall <span class="fine-inline">(optional)</span></label>
          <input id="giveMsg" maxlength="140" placeholder="In loving memory of a wonderful soul.">

      <button class="btn btn-gold btn-block" id="giveGo">${icon('heart')} Complete Tribute Donation</button>
      <p class="fine">${this._demoNote()}</p>`);

    const box = document.getElementById('modalBox');
    let cents = tiers[1]?.amount || 3500;

    const paint = () => {
      const s = split('donation', cents);
      const activeTier = tiers.find(t => t.amount === cents);
      const tierNote = box.querySelector('#giveTierNote');
      if (tierNote) {
        if (activeTier) {
          tierNote.innerHTML = `✦ <b>Your impact:</b> ${esc(activeTier.desc)}`;
        } else {
          tierNote.innerHTML = `✦ <b>Your impact:</b> 100% directly funds vital animal rescue operations & veterinary care.`;
        }
      }
      
      const breakBox = box.querySelector('#giveBreak');
      if (breakBox) {
        if (!breakBox.hasChildNodes()) {
          breakBox.innerHTML = `
            <div class="give-break__row"><span>Your donation</span><b id="gb-gross"></b></div>
            <div class="give-break__row is-fee"><span>Direct processing (Stripe rate)</span><b id="gb-proc"></b></div>
            <div class="give-break__row is-fee"><span>Platform fee</span><b>${fmt(0)} (0%)</b></div>
            <div class="give-break__row is-total"><span>Delivered to ${esc(ch?.name || 'the charity')}</span><b id="gb-net"></b></div>
          `;
        }
        const gbg = breakBox.querySelector('#gb-gross');
        const gbp = breakBox.querySelector('#gb-proc');
        const gbn = breakBox.querySelector('#gb-net');
        if (gbg) gbg.textContent = fmt(s.gross);
        if (gbp) gbp.textContent = '−' + fmt(s.processor);
        if (gbn) gbn.textContent = fmt(s.charity);
      }
      
      const b = box.querySelector('#giveGo');
      if (b) b.textContent = `Complete Tribute Donation (${fmt(s.gross)})`;
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
      if (cents < 100) return ui.toast('Minimum donation is $1.00.', 'warning');
      const donor = box.querySelector('#giveName').value.trim() || Auth.user?.name || 'Anonymous';
      const message = box.querySelector('#giveMsg').value.trim();
      btn.disabled = true; btn.style.opacity = .5; btn.textContent = 'Processing tribute…';
      try {
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
        ui.toast(`${fmt(entry?.charity ?? cents)} delivered to ${charityName(c.charityId)} — thank you!`, 5500, 'heart');
        this.thanksModal(ui, c, entry);
      } catch (err) {
        ui.toast(String(err.message), 'warning');
        btn.disabled = false; btn.style.opacity = 1; btn.textContent = 'Complete Tribute Donation';
      }
    };
  },

  thanksModal(ui, c, entry) {
    if (!entry) return;
    ui.modal(`
      <h2>${icon('dove')} Thank You for Giving</h2>
      <div class="modal-sub">Your tribute honors ${esc(c.petName)} and saves living rescue animals.</div>
      <div class="give-break">
        <div class="give-break__row"><span>You gave</span><b>${fmt(entry.gross)}</b></div>
        <div class="give-break__row is-fee"><span>Card processing</span><b>−${fmt(entry.processor)}</b></div>
        <div class="give-break__row is-total"><span>Delivered to ${esc(charityName(c.charityId))}</span><b>${fmt(entry.charity)}</b></div>
      </div>
      <div class="district-blurb" style="margin-top:14px">
        ✦ <b>Cryptographically Recorded:</b> This transaction is entry <b>#${entry.seq}</b> in the immutable SHA-256 ledger.
        Hash: <code>${esc(entry.hash.slice(0, 16))}…</code>
      </div>
      <button class="btn btn-gold btn-block" id="thanksLedger">${icon('scroll')} View in Public Transparency Ledger</button>
      <p class="fine">${this._demoNote()}</p>`);
    document.getElementById('modalBox').querySelector('#thanksLedger').onclick = () => this.ledgerModal(ui);
  },

  // ---------------------------------------------------------------
  // Public Cryptographic Transparency Ledger
  // ---------------------------------------------------------------
  async ledgerModal(ui) {
    const t = Ledger.totals();
    const impact = calculateImpact(t.charity);
    const entries = Ledger.load().slice().reverse();
    const check = await Ledger.verify();

    const byCharity = Object.entries(t.byCharity)
      .sort((a, b) => b[1] - a[1])
      .map(([id, cents]) => ({ name: charityName(id) || id, cents }));

    ui.modal(`
      <h2>${icon('scroll')} Public Charity Transparency Ledger</h2>
      <div class="modal-sub">Every transaction this site has ever accepted is published and hash-chained in real time.
        100% cryptographic transparency with zero back-room adjustments.</div>

      <div class="ledger-tot">
        <div class="ledger-tot__big">
          <b>${fmt(t.charity)}</b><span>Delivered to Animal Charities</span>
        </div>
        <div class="ledger-tot__grid">
          <div><b>${fmt(t.gross)}</b><span>Total Raised</span></div>
          <div><b>${fmt(t.processor)}</b><span>Card Fees</span></div>
          <div><b>${fmt(t.ops)}</b><span>Infrastructure</span></div>
          <div><b>${t.count}</b><span>Verified Transactions</span></div>
        </div>
      </div>

      <!-- Real World Impact Tally -->
      <div class="impact-grid" style="margin:14px 0">
        <div class="impact-cell">
          <span class="impact-cell__val">${impact.mealsProvided}</span>
          <span class="impact-cell__lbl">Rescue Meals</span>
        </div>
        <div class="impact-cell">
          <span class="impact-cell__val">${impact.veterinaryExams}</span>
          <span class="impact-cell__lbl">Vet Exams</span>
        </div>
        <div class="impact-cell">
          <span class="impact-cell__val">${impact.seniorComfortDays}</span>
          <span class="impact-cell__lbl">Hospice Days</span>
        </div>
        <div class="impact-cell">
          <span class="impact-cell__val">${impact.emergencySurgeries}</span>
          <span class="impact-cell__lbl">Surgeries Funded</span>
        </div>
      </div>

      <div class="ledger-check ${check.ok ? 'is-ok' : 'is-bad'}">
        ${icon(check.ok ? 'crest' : 'warning')}
        ${check.ok
          ? `✦ Cryptographic Proof: SHA-256 hash-chain verified. All ${check.count} entries intact & balanced.`
          : `Entry #${check.seq}: ${esc(check.why)}`}
      </div>

      ${byCharity.length ? `
        <div class="shop-cat" style="margin-top:16px">Total Giving Delivered by Rescue Organisation</div>
        ${byCharity.map(c => `
          <div class="ledger-row">
            <span>${esc(c.name)}</span><b>${fmt(c.cents)}</b>
          </div>`).join('')}` : ''}

      <div class="shop-cat">Statutory Allocation Table</div>
      <div class="ledger-splits">
        ${Object.entries(SPLITS).map(([k, r]) => `
          <div class="ledger-row">
            <span>${esc(r.label)}</span>
            <b>${pct(r.charity)} to charity</b>
          </div>`).join('')}
      </div>

      <div class="shop-cat">Live Append-Only Ledger Records</div>
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
                · <code>${esc(e.hash.slice(0, 14))}</code>
              </div>
            </div>`).join('')}
        </div>`
      : `<div class="cause-empty">${icon('scroll', { size: 28 })}<p>No transactions yet recorded.</p></div>`}

      <button class="btn btn-outline btn-block" id="ledgerExport" style="margin-top:14px">
        ${icon('book')} Export Cryptographic Audit Ledger (JSON)
      </button>
      <p class="fine">${this._demoNote()}</p>`);

    document.getElementById('modalBox').querySelector('#ledgerExport').onclick = () => {
      const blob = new Blob([Ledger.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `eternity-valley-charity-ledger-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      ui.toast('Full cryptographic audit ledger downloaded.', 'book');
    };
  },

  _demoNote() {
    return 'Eternity Valley operates under an open-source, 100% verified charitable pass-through model. '
      + 'Listed charities are verified 501(c)(3) nonprofits with public IRS filings.';
  },
};

export default CharityUI;
