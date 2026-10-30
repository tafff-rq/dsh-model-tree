/**
 * dsh-model-tree —— 模型选择器二级菜单
 *
 * 把输入框右下角的模型下拉从「一长串平铺」改成两级：
 *   第一级：provider（不眠API / WorkBuddy 账号1 / Trae / 书生·端砚 ...）
 *   第二级：该 provider 下的模型
 *
 * 关键实现约束（踩过的坑，勿改）：
 *   1. 所有 Hook 必须在组件顶部**无条件**调用。任何 return 出现在 Hook 之前
 *      都会触发 React #321（条件 Hook）。
 *   2. getSnapshot 必须返回**稳定引用**，值没变时返回同一个对象；
 *      每次新建对象会让 useSyncExternalStore 判定不稳定而报错。
 *   3. subscribe 函数引用必须稳定，否则每帧重订阅。
 */
window.__ModuleLoader__.load({
	id: 'dsh-model-tree',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		let react = require('react');
		let jsx = require('react/jsx-runtime');

		// ───────── 诊断（默认关闭；出问题时把 DEBUG 改成 true 并重启）─────────
		const DEBUG = false;
		function diag(msg) {
			if (!DEBUG) return;
			try {
				let box = document.getElementById('dsh-mt-diag');
				if (!box) {
					box = document.createElement('div');
					box.id = 'dsh-mt-diag';
					box.style.cssText =
						'position:fixed;left:6px;bottom:6px;z-index:99999;max-width:64vw;' +
						'background:#8b0000;color:#fff;font:11px/1.45 monospace;padding:6px 8px;' +
						'border-radius:4px;white-space:pre-wrap;pointer-events:none';
					document.body.appendChild(box);
				}
				box.textContent += msg + '\n';
			} catch { /* 诊断本身失败就放弃 */ }
		}

		// ───────── 样式 ─────────
		const CSS = `
.mt2_trigger{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;
  border:none;background:none;cursor:pointer;border-radius:6px;font-family:inherit;
  color:var(--dsw-alias-label-secondary);font-size:13px;
  max-width:min(420px,52cqw);overflow:hidden}
.mt2_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mt2_g{color:var(--dsw-alias-label-caption);flex:none;max-width:38%;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt2_s{color:var(--dsw-alias-label-dimmed)}
.mt2_m{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt2_panel{position:fixed;z-index:1200;min-width:300px;max-width:440px;
  max-height:60vh;overflow-y:auto;padding:6px;border-radius:10px;font-size:13px;
  background:var(--dsw-alias-bg-popover,#26262b);color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l1,#3a3a42);box-shadow:0 8px 28px rgba(0,0,0,.45)}
.mt2_hd{display:flex;align-items:center;gap:6px;padding:2px 4px 6px;margin-bottom:4px;
  border-bottom:1px solid var(--dsw-alias-border-l1,#3a3a42)}
.mt2_back{border:none;background:none;cursor:pointer;color:var(--dsw-alias-label-secondary);
  font-size:12px;padding:3px 6px;border-radius:5px;font-family:inherit}
.mt2_back:hover{background:var(--dsw-alias-interactive-bg-hover,#3a3a42)}
.mt2_ttl{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt2_in{width:100%;box-sizing:border-box;margin:0 0 4px;padding:6px 8px;font-size:12px;
  border:none;border-radius:6px;outline:none;font-family:inherit;color:inherit;
  background:var(--dsw-alias-interactive-bg-hover,#313138)}
.mt2_row{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;
  padding:7px 8px;border:none;background:none;cursor:pointer;border-radius:6px;
  color:inherit;text-align:left;font-size:13px;font-family:inherit;line-height:18px}
.mt2_row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#3a3a42)}
.mt2_row:disabled{opacity:.5;cursor:default}
.mt2_row.cur{background:var(--dsw-alias-interactive-bg-hover,#3a3a42)}
.mt2_nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt2_meta{font-size:11px;color:var(--dsw-alias-label-caption)}
.mt2_ok{flex:none;color:var(--dsw-alias-state-success-primary,#4ade80);font-size:13px}
.mt2_msg{padding:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.mt2_err{padding:8px;font-size:11px;color:#ff8a8a;white-space:pre-wrap}
`;

		const TAG = 'dsh-model-tree/v2.css';
		if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + TAG + '"]')) {
			const st = document.createElement('style');
			st.dataset.plugin = 'dsh-model-tree';
			st.dataset.pluginCss = TAG;
			st.textContent = CSS;
			document.head.appendChild(st);
		}

		// ───────── 稳定的空 seat（seat 缺失时用，保证 Hook 调用次数一致）─────────
		const EMPTY_SNAPSHOT = Object.freeze({
			catalog: null, status: 'idle', error: null, current: null, pending: null,
		});
		const NOOP_UNSUBSCRIBE = () => {};
		const NOOP_SEAT = {
			subscribe: () => NOOP_UNSUBSCRIBE,
			getSnapshot: () => EMPTY_SNAPSHOT,
			reload: () => {},
			choose: () => Promise.resolve(false),
		};

		/** 兜底 seat：inject 链路失效时组件直接用这个。 */
		let globalSeat = null;

		// ───────── 组件 ─────────
		function ModelTree(props) {
			// ⚠️ 所有 Hook 必须在任何 return 之前无条件执行。
			const safeProps = props || {};
			const seat = safeProps.seat || globalSeat || NOOP_SEAT;

			const snap = react.useSyncExternalStore(seat.subscribe, seat.getSnapshot);
			const [open, setOpen] = react.useState(false);
			const [pane, setPane] = react.useState('model');
			const [activeGroup, setActiveGroup] = react.useState(null);
			const [query, setQuery] = react.useState('');
			const [pos, setPos] = react.useState({ left: 40, top: 40 });
			const rootRef = react.useRef(null);
			const triggerRef = react.useRef(null);
			const panelRef = react.useRef(null);

			react.useEffect(() => {
				if (!open) return undefined;
				const onDown = (e) => {
					if (rootRef.current && rootRef.current.contains(e.target)) return;
					if (panelRef.current && panelRef.current.contains(e.target)) return;
					setOpen(false);
				};
				const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
				document.addEventListener('mousedown', onDown);
				document.addEventListener('keydown', onKey);
				return () => {
					document.removeEventListener('mousedown', onDown);
					document.removeEventListener('keydown', onKey);
				};
			}, [open]);

			// ── 以下为普通渲染逻辑，Hook 已全部调用完毕 ──
			try {
				return buildTree({
					safeProps, seat, snap, open, setOpen, pane, setPane,
					activeGroup, setActiveGroup, query, setQuery, pos, setPos,
					rootRef, triggerRef, panelRef,
				});
			} catch (error) {
				diag('❌ 渲染抛错: ' + String(error && error.stack || error).slice(0, 260));
				return null;
			}
		}

		function buildTree(s) {
			const {
				safeProps, seat, snap, open, setOpen, pane, setPane,
				activeGroup, setActiveGroup, query, setQuery, pos, setPos,
				rootRef, triggerRef, panelRef,
			} = s;

			const available = safeProps.available !== false;
			const locked = safeProps.locked === true;
			if (!available) return null;

			const catalog = snap.catalog;
			const groups = (catalog && Array.isArray(catalog.groups) ? catalog.groups : [])
				.filter((g) => g && Array.isArray(g.models) && g.models.length > 0);
			const current = snap.current;
			const pending = snap.pending;
			const busy = pending != null;

			const curGroup = current ? groups.find((g) => g.id === current.provider) : undefined;
			const curModel = curGroup ? curGroup.models.find((m) => m.id === current.model) : undefined;

			const openMenu = () => {
				try { seat.reload(); } catch (e) { diag('reload 抛错: ' + e.message); }
				const target = (activeGroup && groups.some((g) => g.id === activeGroup))
					? activeGroup
					: (curGroup ? curGroup.id : (groups.length === 1 ? groups[0].id : null));
				if (target) { setActiveGroup(target); setPane('model'); }
				else setPane('group');
				setQuery('');
				setOpen(true);
				requestAnimationFrame(() => {
					try {
						const r = triggerRef.current && triggerRef.current.getBoundingClientRect();
						if (!r) return;
						const w = 360;
						setPos({
							left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
							top: Math.max(8, r.top - 8 - 340),
						});
					} catch { /* 用默认位置 */ }
				});
			};

			const pick = (group, model) => {
				const sel = {
					provider: group.id,
					model: model.id,
					...(model.reasoning && model.reasoning.defaultEffort !== undefined
						? { reasoningEffort: model.reasoning.defaultEffort }
						: {}),
				};
				seat.choose(sel).then((ok) => { if (ok) setOpen(false); }).catch(() => {});
			};

			const triggerText = curGroup
				? ((curGroup.name || curGroup.id) + ' / ' + (curModel ? (curModel.name || curModel.id) : current.model))
				: '请选择模型';

			let body;
			if (snap.error) {
				body = jsx.jsx('div', { className: 'mt2_err', children: '加载失败：' + snap.error });
			} else if (groups.length === 0) {
				body = jsx.jsx('div', {
					className: 'mt2_msg',
					children: snap.status === 'loading' ? '正在加载模型…' : '没有可用模型',
				});
			} else if (pane === 'group') {
				body = groups.map((g) => jsx.jsxs('button', {
					type: 'button',
					className: 'mt2_row' + (current && current.provider === g.id ? ' cur' : ''),
					onClick: () => { setActiveGroup(g.id); setPane('model'); setQuery(''); },
					children: [
						jsx.jsx('span', { className: 'mt2_nm', children: g.name || g.id }),
						jsx.jsx('span', { className: 'mt2_meta', children: g.models.length + ' 个' }),
						current && current.provider === g.id
							? jsx.jsx('span', { className: 'mt2_ok', children: '✓' }) : null,
					],
				}, g.id));
			} else {
				const g = groups.find((x) => x.id === activeGroup) || groups[0];
				const q = query.trim().toLowerCase();
				const list = q
					? g.models.filter((m) =>
						(m.name || m.id).toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
					: g.models;
				body = list.length === 0
					? jsx.jsx('div', { className: 'mt2_msg', children: '没有匹配的模型' })
					: list.map((m) => jsx.jsxs('button', {
						type: 'button',
						className: 'mt2_row' + (current && current.provider === g.id && current.model === m.id ? ' cur' : ''),
						disabled: busy,
						onClick: () => pick(g, m),
						children: [
							jsx.jsx('span', { className: 'mt2_nm', children: m.name || m.id }),
							current && current.provider === g.id && current.model === m.id
								? jsx.jsx('span', { className: 'mt2_ok', children: '✓' }) : null,
						],
					}, m.id));
			}

			const panel = open
				? jsx.jsxs('div', {
					ref: panelRef,
					className: 'mt2_panel',
					style: { left: pos.left + 'px', top: pos.top + 'px' },
					children: [
						pane === 'model' && groups.length > 1
							? jsx.jsxs('div', {
								className: 'mt2_hd',
								children: [
									jsx.jsx('button', {
										type: 'button',
										className: 'mt2_back',
										onClick: () => { setPane('group'); setQuery(''); },
										children: '‹ 返回',
									}),
									jsx.jsx('span', {
										className: 'mt2_ttl',
										children: (groups.find((x) => x.id === activeGroup) || {}).name || '',
									}),
								],
							})
							: null,
						pane === 'model' && groups.length > 0
							? jsx.jsx('input', {
								className: 'mt2_in',
								type: 'text',
								placeholder: '搜索模型…',
								value: query,
								onChange: (e) => setQuery(e.target.value),
							})
							: null,
						body,
					],
				})
				: null;

			return jsx.jsxs('div', {
				ref: rootRef,
				style: { position: 'relative', display: 'inline-flex', minWidth: 0 },
				children: [
					jsx.jsxs('button', {
						ref: triggerRef,
						type: 'button',
						className: 'mt2_trigger',
						disabled: locked,
						title: triggerText,
						onClick: () => (open ? setOpen(false) : openMenu()),
						children: curGroup
							? [
								jsx.jsx('span', { className: 'mt2_g', children: curGroup.name || curGroup.id }, 'g'),
								jsx.jsx('span', { className: 'mt2_s', children: '/' }, 's'),
								jsx.jsx('span', {
									className: 'mt2_m',
									children: curModel ? (curModel.name || curModel.id) : current.model,
								}, 'm'),
							]
							: jsx.jsx('span', { className: 'mt2_m', children: triggerText }, 'm'),
					}),
					panel,
				],
			});
		}

		// ───────── 插件 ─────────
		const inject = ['slots', 'sessions', 'remote', 'remote.session', 'locale'];

		const seats = new Map();

		function createSeat(ctx, sessionId) {
			// 快照必须稳定：只在值变化时换新对象，否则 useSyncExternalStore 报错。
			let snap = { catalog: null, status: 'idle', error: null, current: null, pending: null };
			const listeners = new Set();
			const patch = (next) => {
				snap = { ...snap, ...next };
				for (const fn of listeners) fn();
			};
			let seq = 0;

			const subscribe = (fn) => {
				listeners.add(fn);
				return () => { listeners.delete(fn); };
			};
			const getSnapshot = () => snap;

			const bindProjection = () => {
				if (sessionId === undefined) return;
				try {
					const binding = ctx.sessions.binding(sessionId);
					if (!binding) { diag('binding 为空'); return; }
					const proj = binding.session.projections.faceOf('modelSelection');
					if (!proj) { diag('无 modelSelection 投影'); return; }
					const read = () => {
						try {
							const v = typeof proj.getSnapshot === 'function' ? proj.getSnapshot() : proj.value;
							if (v && v.provider) {
								patch({
									current: {
										provider: v.provider,
										model: v.model,
										...(v.reasoningEffort === undefined ? {} : { reasoningEffort: v.reasoningEffort }),
									},
								});
							}
						} catch (e) { diag('投影读取抛错: ' + e.message); }
					};
					read();
					if (typeof proj.subscribe === 'function') proj.subscribe(read);
				} catch (e) {
					diag('bindProjection: ' + String(e && e.message).slice(0, 140));
				}
			};

			return {
				subscribe,
				getSnapshot,
				async reload() {
					const mine = ++seq;
					if (snap.status !== 'ready') patch({ status: 'loading', error: null });
					try {
						const answer = await ctx.remote.session.modelCatalog();
						if (mine !== seq) return;
						if (!answer || !answer.ok) {
							throw new Error(answer && answer.error
								? answer.error.code + ': ' + answer.error.message
								: 'modelCatalog 返回空');
						}
						const catalog = answer.value;
						const next = { catalog, status: 'ready', error: null };
						if (snap.current === null && catalog && catalog.default) {
							next.current = { provider: catalog.default.provider, model: catalog.default.model };
						}
						patch(next);
					} catch (e) {
						if (mine !== seq) return;
						patch({ status: 'error', error: String(e && e.message || e).slice(0, 200) });
						diag('modelCatalog 失败: ' + String(e && e.message).slice(0, 160));
					}
				},
				async choose(selection) {
					patch({ pending: selection });
					try {
						const answer = await ctx.remote.session.selectModel(selection);
						if (!answer || !answer.ok) {
							const msg = answer && answer.error
								? answer.error.code + ': ' + answer.error.message
								: '未知错误';
							patch({ pending: null, error: msg });
							diag('selectModel 失败: ' + msg.slice(0, 140));
							return false;
						}
						patch({ current: selection, pending: null, error: null });
						return true;
					} catch (e) {
						patch({ pending: null, error: String(e && e.message || e) });
						return false;
					}
				},
				init() { bindProjection(); },
			};
		}

		function apply(ctx) {
			try {
				diag('apply(): slots=' + typeof ctx.slots + ' remote=' + typeof ctx.remote);

				ctx.inject(['slots', 'sessions', 'remote', 'remote.session'], (scope) => {
					// 兜底 seat：注入链路失效时组件仍有东西可渲染
					globalSeat = createSeat(scope, undefined);
					globalSeat.init();

					scope.slots.inject('conversation.input.model', () => scope.slots.register({
						name: 'conversation.input.model',
						inject: (sessionId) => {
							try {
								let available = true;
								try {
									available = scope.sessions.subagentAddress(sessionId) === undefined;
								} catch { /* 保守当可用 */ }
								let seat = seats.get(sessionId);
								if (!seat) {
									seat = createSeat(scope, sessionId);
									seats.set(sessionId, seat);
									seat.init();
								}
								return { available, seat };
							} catch (e) {
								diag('per-session inject: ' + String(e && e.message).slice(0, 140));
								return { available: true, seat: globalSeat };
							}
						},
					}, ModelTree));
				});
			} catch (e) {
				diag('apply 抛错: ' + String(e && e.stack || e).slice(0, 300));
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
