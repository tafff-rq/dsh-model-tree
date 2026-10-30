/**
 * dsh-model-tree —— 宿主侧。
 *
 * 纯 UI 插件：宿主半侧不做事，但**必须声明依赖的宿主服务**，
 * 否则 ctx 上只有 fiber，浏览器半侧拿不到 slots / modelDirectories。
 */

/** 宿主侧必须声明的服务。 */
export const inject = ['llm', 'slots'];

/** Host plugin body — 本插件没有宿主侧行为。 */
export function apply() {}
