# dsh-model-tree

给 [the coding assistant (DSH)](https://github.com/deepseek-ai/the coding assistant) 的模型选择器加上**二级菜单**。

当你在多个中转站 / 多个账号之间切换时，内置选择器会把所有 provider 的模型摊平成一长列，找模型变成翻列表。这个插件把它改成两级：

```
第一次点开                     选一个 provider 后
┌────────────────────┐        ┌──────────────────────────┐
│ 不眠API      52 个 ›│        │ ‹返回   不眠API           │
│ WorkBuddy 1  19 个 ›│   →    │ ┌──────────────────────┐ │
│ Trae         21 个 ›│        │ │ 搜索模型…             │ │
│ 书生·端砚    10 个 ›│        │ ├──────────────────────┤ │
└────────────────────┘        │ │ GPT-6.1-Sol        ✓ │ │
                              │ │ GPT-6-Sol            │ │
                              │ │ claude-sonnet-5      │ │
                              │ └──────────────────────┘ │
                              └──────────────────────────┘
```

## 效果

- 启动后优先显示会话保存的上次选择，按钮格式为 `provider / 模型 / 强度值`；不额外写“强度：”，不支持强度时只显示分组和模型
- 点开先进 provider 列表，每个 provider 显示模型数量
- 进到某个 provider 后可以搜索过滤；点击支持强度的模型，会在右侧并排打开强度菜单
- 之后可在模型列表再次点击当前模型，进入强度菜单修改强度
- 左上「‹ 返回」回到 provider 列表
- 当前选中的 provider 和模型都有勾选标记

## 安装

在你的 DSH profile 目录（`package.json` 里列着 `dsh.profile.bundles` 的那个）执行：

```sh
pnpm add dsh-model-tree
```

然后把包名加进 `dsh.profile.bundles`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "...",
        "dsh-model-tree"
      ]
    }
  }
}
```

重启 DSH 生效。

## 卸载

```sh
pnpm remove dsh-model-tree
```

并把包名从 `dsh.profile.bundles` 里删掉。内置选择器会原样回来 —— **这个插件不改任何官方文件**，删除即完全还原。

通过插件管理器热关闭时，若当前页面没有自动恢复内置选择器，插件会在卸载清理后刷新当前页面，让已关闭插件的配置重新挂载原生选择器。

## 实现说明

DSH 的输入框有一个 `conversation.input.model` slot，声明为 `kind: "single"`。
这个 slot 的官方契约标注了 `replaceRisk: "shadows-shipped-ui"` ——
先注册的条目生效，所以插件注册到这里就会**替换**内置选择器，而不是并排显示。

数据来源与内置选择器一致：

- `ctx.remote.session.modelCatalog()` —— 模型目录
- `ctx.remote.session.selectModel()` —— 提交选择
- `session.projections.faceOf('modelSelection')` —— 当前选择

## 已知约束

- **会话级隔离**：每个 session 有独立的目录缓存，与内置行为一致
- **subagent 会话不可选模型**（`available: false`，与内置一致）
- **换 provider 集合不刷新时**：改配置后需重启 DSH（这是 DSH 的模型目录机制决定的）

## 开发提示

如果你要改这个插件，注意两个踩过的坑：

1. **所有 React Hook 必须在组件顶部无条件调用**。在 Hook 之前 `return` 会触发
   React error #321（条件 Hook）—— 表现为选择器直接消失。
2. **`getSnapshot` 必须返回稳定引用**。每次新建对象会让
   `useSyncExternalStore` 判定状态不稳定而抛错。

排查问题时把 `lib/client.js` 顶部的 `DEBUG` 改成 `true`，重启后页面左下角会显示诊断信息。

## License

MIT
