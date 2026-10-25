"use strict";
// Disposable presentation only: no commands, dice, session mutations or input locks.
class CombatVisualFX {
  static MODES = ["off", "standard", "rich"];
  static SLOT = "dnd-combat-visuals-v2";
  static MAX_EVENTS = 128;
  static SPELLS = {
    fireBolt: ["fire", "attack"], rayFrost: ["ice", "attack"],
    scorchingRay: ["fire", "attack"], mindSliver: ["mind", "targets"],
    magicMissile: ["arcane", "missiles"], fireball: ["fire", "circle", 20],
    chainLightning: ["storm", "targets"],
    burningHands: ["fire", "cone", 15], coneCold: ["ice", "cone", 60],
    thunderwave: ["storm", "cone", 15], drainingWave: ["shadow", "cone", 30],
    web: ["web", "web", 20], fogCloud: ["mist", "circle", 20],
    darkness: ["shadow", "circle", 15], stormSphere: ["storm", "circle", 20],
    zoneTruth: ["holy", "circle", 20],
    mistyStep: ["mist", "teleport"], dimensionDoor: ["mist", "teleport"],
    bigbyHand: ["arcane", "hand"], mageHand: ["arcane", "hand"],
    shield: ["ice", "shield"], shieldFaith: ["holy", "shield"],
    mageArmor: ["arcane", "shield"], protectionEvil: ["holy", "shield"],
    wardingBond: ["holy", "shield"], cureWounds: ["holy", "healing"],
    lesserRestoration: ["holy", "targets"], aid: ["holy", "targets"],
    heroism: ["holy", "targets"], bless: ["holy", "targets"],
    beaconHope: ["holy", "targets"], auraVitality: ["holy", "targets"],
    crusaderMantle: ["holy", "targets"], divineSmite: ["holy", "targets"],
    findSteed: ["holy", "targets"], holdMonster: ["mind", "targets"],
    command: ["mind", "targets"], compelledDuel: ["mind", "targets"],
    slow: ["mind", "targets"], greaterInvisibility: ["shadow", "targets"],
    seeming: ["arcane", "targets"], fly: ["mist", "targets"],
    counterspell: ["arcane", "counter"], dispelMagic: ["arcane", "targets"],
    prestidigitation: ["arcane", "targets"],
  };
  static FLAGS = {
    unconscious: ["down", "Без сознания", "◒"], prone: ["prone", "Лежит", "↘"],
    burning: ["fire", "Горение", "♨"], restrained: ["web", "Опутан", "⌗"],
    grappled: ["web", "Схвачен", "⌗"], rooted: ["web", "Укоренён", "⌗"],
    frost: ["ice", "Охлаждение", "❄"], poisoned: ["poison", "Отравлен", "●"],
    shield: ["shield", "Щит", "⬡"], protected: ["shield", "Под защитой", "⬡"],
    frightened: ["mind", "Испуган", "!"], stunned: ["mind", "Ошеломлён", "!"],
    paralyzed: ["mind", "Парализован", "!"], petrified: ["stone", "Окаменение", "◆"],
    invisible: ["shadow", "Невидимость", "◌"], aim: ["aim", "Прицеливание", "◎"],
  };
  static school(type, weapon = "") {
    if (this.SPELLS[weapon]) return this.SPELLS[weapon][0];
    if (/storm|thunder/.test(weapon)) return "storm";
    return ({fire:"fire",cold:"ice",lightning:"storm",thunder:"storm",
      psychic:"mind",radiant:"holy",necrotic:"shadow",poison:"poison",
      acid:"poison",force:"arcane"})[type] || "steel";
  }
  static since(events, sequence) {
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].seq <= sequence) lo = mid + 1;
      else hi = mid;
    }
    return events.slice(Math.max(lo, events.length - this.MAX_EVENTS));
  }
  static plan(events) {
    const out = [];
    for (const e of events) {
      const base = { seq:e.seq, source:e.actor, target:e.target, point:e.point };
      if (["move", "forcedMove"].includes(e.type) && e.from && e.to) {
        const last = out.at(-1);
        if (last?.kind === "move" && last.source === e.actor &&
            last.to.x === e.from.x && last.to.y === e.from.y) {
          last.path.push({...e.to}); last.to = {...e.to};
        } else out.push({...base,kind:"move",from:{...e.from},to:{...e.to},path:[{...e.from},{...e.to}]});
      } else if (e.type === "teleport") {
        out.push({...base,kind:"teleport",from:e.from,to:e.to,school:"mist"});
        if (e.passenger) out.push({...base,kind:"teleport",source:e.passenger,
          from:e.passengerFrom,to:e.passengerTo,school:"mist"});
      } else if (e.type === "attack" || e.type === "attackMissed") {
        out.push({...base,kind:"attack",from:e.origin,attackKind:e.attackKind,
          object:e.object,unarmed:e.unarmed,projectile:e.projectile,weapon:e.weapon,
          school:this.school(e.damageType,e.weapon),hit:e.type === "attackMissed" ? false : e.hit,critical:e.critical});
      } else if (e.type === "damage") {
        const elemental = e.components?.find(p => this.school(p.damageType) !== "steel" && p.amount > 0);
        out.push({...base,kind:"damage",target:e.actor,source:e.source,
          school:this.school(elemental?.damageType || e.damageType),amount:e.amount});
      } else if (e.type === "heal") {
        if (e.amount !== 0) out.push({...base,kind:"heal",target:e.actor,school:"holy",amount:e.amount});
      } else if (e.type === "cast") {
        out.push({...base,kind:"cast",spell:e.spell,school:this.SPELLS[e.spell]?.[0] || "arcane"});
        if (e.spell === "darkness" || e.resolved)
          out.push({...base,kind:"spell",spell:e.spell,targets:e.targets || [],level:e.level});
      } else if (e.type === "spellResolved") {
        out.push({...base,kind:"spell",spell:e.spell,targets:e.targets || [],from:e.origin,level:e.level});
      } else if (["reaction","deflect","shieldBlocked","damageTransfer"].includes(e.type)) {
        out.push({...base,kind:"shield",target:e.target || e.actor,school:e.type === "damageTransfer" ? "holy" : "ice"});
      } else if (e.type === "counterspell" && e.cancelled) {
        out.push({...base,kind:"counter",school:"arcane"});
      } else if (e.type === "hand") {
        out.push({...base,kind:"hand",school:"arcane",mode:e.mode});
      }
    }
    return out;
  }
  constructor(root) {
    this.root = root; this.board = root.querySelector("#board");
    this.doc = root.ownerDocument; this.win = this.doc.defaultView;
    this.layer = this.doc.createElement("div"); this.layer.className = "combat-fx-layer";
    this.layer.setAttribute("aria-hidden", "true"); this.board.parentElement.append(this.layer);
    this.active = new Map(); this.tokens = new Map(); this.previous = new Map();
    this.engine = null; this.sequence = 0; this.mode = "standard"; this.speed = 1;
    this.stats = {events:0,created:0,dropped:0,peak:0,counts:{}};
    this.reduced = this.win.matchMedia?.("(prefers-reduced-motion: reduce)");
    try {
      const saved = JSON.parse(this.win.localStorage.getItem(CombatVisualFX.SLOT) || "null");
      if (CombatVisualFX.MODES.includes(saved?.mode)) this.mode = saved.mode;
      if ([1,1.5,2].includes(saved?.speed)) this.speed = saved.speed;
    } catch { /* Storage denial must not block the battle. */ }
    this.select = root.querySelector("#combat-fx-mode");
    this.tempo = root.querySelector("#combat-fx-speed"); this.hint = root.querySelector("#combat-fx-hint");
    this.select?.addEventListener("change", () => this.setMode(this.select.value));
    this.tempo?.addEventListener("change", () => this.setSpeed(Number(this.tempo.value)));
    this.onMotion = () => { this.clear(); this.controls(); };
    this.reduced?.addEventListener?.("change", this.onMotion);
    this.onVisibility = () => { if (this.doc.hidden) this.clear(); };
    this.doc.addEventListener("visibilitychange", this.onVisibility);
    if (this.win.ResizeObserver) {
      let width, height;
      this.resize = new this.win.ResizeObserver(([entry]) => {
        const box = entry.contentRect;
        if (width !== undefined && (width !== box.width || height !== box.height)) this.clear();
        width = box.width; height = box.height;
      });
      this.resize.observe(this.board);
    }
    this.controls();
  }
  get enabled() { return !this.failure && this.mode !== "off" && !this.reduced?.matches && !this.doc.hidden; }
  get limit() { return this.mode === "rich" ? 40 : 24; }
  controls() {
    if (this.select) {
      this.select.value = this.reduced?.matches ? "off" : this.mode;
      this.select.disabled = Boolean(this.reduced?.matches);
    }
    if (this.tempo) this.tempo.value = String(this.speed);
    if (this.hint) this.hint.textContent = this.reduced?.matches
      ? "Движение отключено настройкой системы. Обозначения состояний остаются."
      : "Короткие эффекты не задерживают ход. Состояния отмечены без мигания.";
  }
  persist() {
    try { this.win.localStorage.setItem(CombatVisualFX.SLOT,JSON.stringify({mode:this.mode,speed:this.speed})); } catch {}
  }
  setMode(mode) {
    if (!CombatVisualFX.MODES.includes(mode)) return false;
    this.mode = mode; this.clear(); this.controls(); this.persist(); return true;
  }
  setSpeed(speed) {
    if (![1,1.5,2].includes(speed)) return false;
    this.speed = speed; this.clear(); this.controls(); this.persist(); return true;
  }
  remove(node) {
    const record = this.active.get(node); if (!record) return;
    this.active.delete(node); this.win.clearTimeout(record.timer);
    record.animation?.cancel(); node.remove();
    if (record.moving) this.tokens.get(record.moving)?.removeAttribute("data-fx-moving");
  }
  clear() { for (const node of [...this.active.keys()]) this.remove(node); }
  clearActor(id) {
    for (const [node,record] of this.active) if (record.moving === id) this.remove(node);
  }
  destroy() {
    this.clear(); this.resize?.disconnect(); this.layer.remove();
    this.reduced?.removeEventListener?.("change",this.onMotion);
    this.doc.removeEventListener("visibilitychange",this.onVisibility);
  }
  node(kind, school = "arcane", text = "") {
    if (!this.enabled || this.active.size >= this.limit) { this.stats.dropped++; return null; }
    const node = this.doc.createElement("span");
    node.className = "combat-fx combat-fx-" + kind + " fx-" + school;
    node.dataset.fx = kind; node.textContent = text;
    this.layer.append(node); this.active.set(node,{});
    this.stats.created++; this.stats.peak = Math.max(this.stats.peak,this.active.size);
    this.stats.counts[kind] = (this.stats.counts[kind] || 0) + 1;
    return node;
  }
  run(node, frames, duration, delay = 0, moving = null) {
    if (!node) return;
    const record = this.active.get(node); if (!record) return;
    record.moving = moving;
    try {
      record.animation = node.animate(frames,{duration:duration / this.speed,
        delay:delay / this.speed,easing:"ease-out",fill:"both"});
      record.animation.onfinish = () => this.remove(node);
      record.animation.oncancel = () => this.remove(node);
      record.timer = this.win.setTimeout(() => this.remove(node),(duration + delay) / this.speed + 100);
    } catch { this.remove(node); }
  }
  point(point) {
    const t = this.engine.s.terrain;
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.y >= 0 && point.x < t.width && point.y < t.height;
  }
  center(point) { return {x:(point.x + .5) * this.cw,y:(point.y + .5) * this.ch}; }
  place(node, point, cells = .8) {
    if (!node) return;
    const p = this.center(point);
    // Huge upcast clouds are clipped to the field anyway; never allocate an
    // unbounded offscreen compositing surface for their decorative radius.
    cells = Math.min(cells, 2 * Math.max(this.engine.s.terrain.width,this.engine.s.terrain.height));
    Object.assign(node.style,{left:p.x + "px",top:p.y + "px",
      width:this.cw * cells + "px",height:this.ch * cells + "px"});
  }
  visible(id) { return Boolean(id && this.tokens.has(id)); }
  position(id) { const u = this.engine.s.units[id]; return u && {x:u.x,y:u.y}; }
  seen(point) {
    if (!this.point(point)) return false;
    return this.engine.s.order.some(id => this.engine.unit(id).controlled &&
      this.engine.active(id) && this.engine.canSee(id,point));
  }
  mark(kind, point, school, text = "", delay = 0, cells = .8) {
    if (!this.point(point)) return;
    const node = this.node(kind,school,text); this.place(node,point,cells);
    this.run(node,[{opacity:0,transform:"translate(-50%,-50%) scale(.55)"},
      {opacity:.95,offset:.2,transform:"translate(-50%,-50%) scale(1)"},
      {opacity:0,transform:"translate(-50%,-50%) scale(1.35)"}],420,delay);
    return node;
  }
  number(point, amount, healing, delay = 0) {
    if (!this.point(point) || !Number.isFinite(amount)) return;
    const node = this.node("number",healing ? "holy" : "steel",(healing ? "+" : "−") + amount);
    this.place(node,point,1.2);
    this.run(node,[{opacity:0,transform:"translate(-50%,-20%)"},
      {opacity:1,offset:.15,transform:"translate(-50%,-65%)"},
      {opacity:0,transform:"translate(-50%,-155%)"}],650,delay);
  }
  svg(node, path, viewBox = "0 0 48 16", fill = "none") {
    if (!node) return;
    const svg = this.doc.createElementNS("http://www.w3.org/2000/svg","svg"),
      shape = this.doc.createElementNS(svg.namespaceURI,"path");
    svg.setAttribute("viewBox",viewBox); svg.setAttribute("preserveAspectRatio","none");
    shape.setAttribute("d",path); shape.setAttribute("fill",fill);
    shape.setAttribute("stroke","currentColor"); shape.setAttribute("stroke-width","2");
    shape.setAttribute("stroke-linejoin","round"); shape.setAttribute("stroke-linecap","round");
    svg.append(shape); node.append(svg);
  }
  projectile(from, to, school, physical = false, delay = 0) {
    if (!this.point(from) || !this.point(to)) return;
    const a = this.center(from), b = this.center(to),
      angle = Math.atan2(b.y-a.y,b.x-a.x) * 180 / Math.PI,
      node = this.node(physical === "thrown" ? "thrown" : physical ? "arrow" : "projectile",school);
    if (!node) return;
    this.place(node,from,physical ? .65 : .28);
    if (physical === "thrown") this.svg(node,"M3 6H12L33 3 45 8 33 13H12V10H3ZM12 3V13");
    else if (physical) this.svg(node,"M2 8H42M32 2L43 8 32 14M6 3L12 8 6 13");
    this.run(node,[{opacity:0,transform:`translate(-50%,-50%) rotate(${angle}deg)`},
      {opacity:1,offset:.12,transform:`translate(-50%,-50%) rotate(${angle}deg)`},
      {opacity:.9,transform:`translate(calc(-50% + ${b.x-a.x}px),calc(-50% + ${b.y-a.y}px)) rotate(${angle}deg)`}],230,delay);
  }
  lightning(from, to, delay = 0) {
    if (!this.point(from) || !this.point(to)) return;
    const a = this.center(from), b = this.center(to), dx=b.x-a.x,dy=b.y-a.y,
      length=Math.hypot(dx,dy) || 1, nx=-dy/length*this.cw*.12, ny=dx/length*this.ch*.12;
    let path = `M${a.x} ${a.y}`;
    for (let i=1;i<6;i++) path += `L${a.x+dx*i/6+nx*(i%2?1:-1)} ${a.y+dy*i/6+ny*(i%2?1:-1)}`;
    path += `L${b.x} ${b.y}`;
    const node = this.node("lightning","storm"); this.svg(node,path,`0 0 ${this.width} ${this.height}`);
    this.run(node,[{opacity:0},{opacity:.95,offset:.15},{opacity:0}],270,delay);
  }
  move(ev) {
    this.clearActor(ev.source);
    const token = this.tokens.get(ev.source), end = this.position(ev.source);
    if (!token || this.engine.s.pending || !this.previous.has(ev.source) ||
        end?.x !== ev.to.x || end?.y !== ev.to.y || !ev.path.every(p => this.seen(p))) return;
    const node = this.node("ghost","steel"); if (!node) return;
    const clone = token.cloneNode(true);
    clone.removeAttribute("data-unit"); clone.removeAttribute("data-fx-moving");
    node.append(clone); this.place(node,ev.to,1);
    const b = this.center(ev.to); token.setAttribute("data-fx-moving","");
    const frames = ev.path.map(p => {
      const a = this.center(p);
      return {transform:`translate(calc(-50% + ${a.x-b.x}px),calc(-50% + ${a.y-b.y}px))`};
    });
    this.run(node,frames,Math.min(650,110*(ev.path.length-1)),0,ev.source);
  }
  lunge(ev, from, to) {
    this.clearActor(ev.source);
    if (this.engine.s.pending) return;
    const token = this.tokens.get(ev.source);
    if (!token || !this.point(from) || !this.point(to)) return;
    const node = this.node("ghost","steel"); if (!node) return;
    const clone = token.cloneNode(true); clone.removeAttribute("data-unit");
    clone.removeAttribute("data-fx-moving"); node.append(clone); this.place(node,from,1);
    const a = this.center(from), b = this.center(to), len = Math.hypot(b.x-a.x,b.y-a.y) || 1,
      dx=(b.x-a.x)/len*this.cw*.18,dy=(b.y-a.y)/len*this.ch*.18;
    token.setAttribute("data-fx-moving","");
    this.run(node,[{transform:"translate(-50%,-50%)"},
      {offset:.45,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`},
      {transform:"translate(-50%,-50%)"}],210,0,ev.source);
  }
  area(ev, school, shape, feet) {
    const point = ev.point || this.position(ev.source);
    // Fog/Darkness can obscure their own centre as soon as they resolve. A
    // player's known placement must not disappear merely because it worked.
    if (!this.point(point) || (!this.seen(point) && !this.engine.unit(ev.source).controlled)) return;
    if (shape === "cone") {
      const from = ev.from || this.position(ev.source); if (!this.point(from) || !this.seen(from)) return;
      const a=this.center(from),b=this.center(point),angle=Math.atan2(b.y-a.y,b.x-a.x),
        rx=this.cw*feet/5,ry=this.ch*feet/5,node=this.node("cone",school);
      this.svg(node,`M${a.x} ${a.y}L${a.x+Math.cos(angle-.4)*rx} ${a.y+Math.sin(angle-.4)*ry}`+
        `Q${a.x+Math.cos(angle)*rx*1.1} ${a.y+Math.sin(angle)*ry*1.1} ${a.x+Math.cos(angle+.4)*rx} ${a.y+Math.sin(angle+.4)*ry}Z`,
        `0 0 ${this.width} ${this.height}`,"currentColor");
      this.run(node,[{opacity:0},{opacity:.18,offset:.25},{opacity:0}],500);
    } else {
      const center=shape==="web" ? {x:point.x+.5,y:point.y+.5} : point,
        node=this.node(shape==="web" ? "web" : "area",school);
      this.place(node,center,shape==="web" ? feet/5 : feet/5*2);
      this.run(node,[{opacity:0,transform:"translate(-50%,-50%) scale(.2)"},
        {opacity:.45,offset:.35,transform:"translate(-50%,-50%) scale(.95)"},
        {opacity:0,transform:"translate(-50%,-50%) scale(1)"}],600);
      if (school==="fire" && this.visible(ev.source)) this.projectile(ev.from || this.position(ev.source),point,school);
      if (school==="storm" && this.visible(ev.source)) this.lightning(ev.from || this.position(ev.source),point);
    }
  }
  spell(ev) {
    if (!this.visible(ev.source)) return;
    const [school,shape,feet] = CombatVisualFX.SPELLS[ev.spell] || ["arcane","targets"];
    if (["attack","teleport","counter","healing"].includes(shape)) return;
    if (["cone","circle","web"].includes(shape)) {
      this.area(ev,school,shape,ev.spell==="fogCloud" ? feet*(ev.level || 1) : feet); return;
    }
    if (shape==="hand") { this.hand(ev); return; }
    const targets=ev.targets.length ? ev.targets : [ev.target || ev.source];
    if (shape==="missiles") {
      for (let i=0;i<Math.min(this.mode==="rich" ? 8 : 4,2+(ev.level||1));i++) {
        const target=targets[i%targets.length];
        if (this.visible(target)) this.projectile(ev.from || this.position(ev.source),this.position(target),school,false,i*45);
      }
      return;
    }
    for (const target of targets.slice(0,this.mode==="rich" ? 12 : 6))
      if (this.visible(target)) this.mark(shape==="shield" ? "shield" : "rune",this.position(target),school);
  }
  hand(ev) {
    const point=ev.point || this.position(ev.target) || this.position(ev.source); if (!this.seen(point)) return;
    const node=this.mark("hand",point,"arcane","",0,1.25);
    this.svg(node,"M10 47V28Q10 24 14 26L19 30V9Q19 4 23 9V24 4Q23 0 27 4V24 7Q27 3 31 7V25 12Q31 8 35 12V33Q35 44 29 47Z","0 0 48 50","currentColor");
  }
  flags(engine,id) {
    const flags=[];
    for (const [key,value] of Object.entries(CombatVisualFX.FLAGS)) if (engine.has(id,key)) flags.push(value);
    for (const effect of engine.s.effects || []) {
      if (effect.until <= engine.s.elapsed || !effect.targets?.includes(id)) continue;
      if (["shieldFaith","mageArmor","wardingBond","protectionEvil"].includes(effect.kind)) flags.push(["shield","Магическая защита","⬡"]);
      if (["bless","heroism","haste"].includes(effect.kind)) flags.push(["holy","Усиление","✦"]);
    }
    if ((engine.s.effects || []).some(x => x.owner===id && x.concentration && x.until>engine.s.elapsed) ||
        engine.s.zones.some(x => x.owner===id && x.concentration && x.until>engine.s.elapsed))
      flags.push(["concentration","Концентрация","◈"]);
    return flags.filter((v,i,a) => a.findIndex(x => x[0]===v[0])===i);
  }
  render(engine) {
    this.tokens=new Map([...this.board.querySelectorAll(".token[data-unit]")].map(n => [n.dataset.unit,n]));
    const baseline=this.engine!==engine || engine.s.sequence<this.sequence;
    if (baseline) { this.clear(); this.engine=engine; this.previous.clear(); }
    const events=baseline ? [] : CombatVisualFX.since(engine.s.events,this.sequence);
    this.sequence=engine.s.sequence; this.stats.events+=events.length;
    for (const [node,record] of this.active)
      if (record.moving && (engine.s.pending || !this.tokens.has(record.moving))) this.remove(node);
    this.width=this.board.clientWidth; this.height=this.board.clientHeight;
    this.cw=this.width/engine.s.terrain.width; this.ch=this.height/engine.s.terrain.height;
    const next=new Map(),changed=[];
    for (const [id,token] of this.tokens) {
      const u=engine.unit(id),flags=this.flags(engine,id),key=flags.map(f=>f[0]).join(" ");
      token.dataset.fxState=key;
      let badge=token.querySelector(".combat-fx-status");
      if (key) {
        if (!badge) { badge=this.doc.createElement("span");badge.className="combat-fx-status";token.append(badge); }
        badge.textContent=flags.slice(0,2).map(f=>f[2]).join(" ");
        badge.title=flags.map(f=>f[1]).join(" · "); badge.setAttribute("aria-label",badge.title);
      } else badge?.remove();
      const old=this.previous.get(id);
      if (old && old.flags!==key && key && events.length) changed.push({id,school:flags[0][0]});
      if (old?.hp>0 && u.hp===0 && events.length) changed.push({id,down:true});
      next.set(id,{x:u.x,y:u.y,hp:u.hp,flags:key});
      if ([...this.active.values()].some(r => r.moving===id)) token.setAttribute("data-fx-moving","");
    }
    if (this.enabled && this.width>0 && this.height>0) {
      const delays=new Map();
      for (const ev of CombatVisualFX.plan(events)) {
        const source=this.visible(ev.source), target=this.visible(ev.target),
          from=ev.from || this.position(ev.source),to=ev.point || this.position(ev.target);
        if (ev.kind==="move") { this.move(ev); continue; }
        if (ev.kind==="spell") { this.spell(ev); continue; }
        if (ev.kind==="teleport") {
          if (source) {this.clearActor(ev.source);for (const p of [ev.from,ev.to]) if (this.seen(p)) this.mark("portal",p,"mist");}
        } else if (ev.kind==="attack") {
          if (!target && !(source && !ev.target && this.point(to))) continue;
          const ranged=["ranged","rangedSpell","thrown"].includes(ev.attackKind),delay=ranged?210:80;
          if (source && ev.attackKind && this.seen(from)) {
            if (ranged && ev.school==="storm") this.lightning(from,to);
            else if (ranged) this.projectile(from,to,ev.school,ev.projectile === "thrown" ? "thrown" : ev.attackKind!=="rangedSpell");
            else {
              if (ev.object) this.hand({...ev,point:from});
              else this.lunge(ev,from,to);
              this.mark(ev.unarmed ? "strike" : "slash",to,ev.school,"",30);
            }
          }
          delays.set(ev.target,delay);
          const node=this.mark(ev.hit ? "impact" : "miss",to,ev.hit?ev.school:"mist",ev.hit ? "" : "Мимо",delay);
          if (node) node.style.setProperty("--fx-angle",((ev.seq%3)*55-55)+"deg");
          if (ev.hit && ev.critical) this.mark("critical",to,"holy","Крит!",delay,.9);
          if (this.mode==="rich" && ev.hit) for (let i=0;i<3;i++) this.mark("spark",to,ev.school,"",delay+i*25,.3+i*.2);
        } else if (ev.kind==="damage" && target) {
          this.number(this.position(ev.target),ev.amount,false,delays.get(ev.target)||0);
          if (!delays.has(ev.target)) this.mark("impact",this.position(ev.target),ev.school);
        } else if (ev.kind==="heal" && target) {
          this.mark("heal",this.position(ev.target),"holy","+",0,1.1);
          this.number(this.position(ev.target),ev.amount,true);
        } else if (ev.kind==="cast" && source) this.mark("rune",this.position(ev.source),ev.school);
        else if (ev.kind==="shield" && target) this.mark("shield",this.position(ev.target),ev.school);
        else if (ev.kind==="counter" && source && target) {
          this.projectile(from,to,"arcane");this.mark("counter",to,"arcane","×",200,1.2);
        } else if (ev.kind==="hand" && source) this.hand(ev);
      }
      for (const c of changed) this.mark(c.down?"down":"status",this.position(c.id),c.down?"mist":c.school,"",0,1.1);
    }
    this.previous=next;
  }
}
if (typeof module !== "undefined") module.exports = { CombatVisualFX };
