# 共享系统计划：游戏馆、角色与个人纪念

## 产品范围

首版提供可筛选的游戏卡片、最近游玩、继续游戏、人数/联网标记，以及一个固定六槽的个人纪念展示页。单人作品无需注册；多人入口清楚显示需要几个人，不将单人练习标成在线房间。

大厅卡片状态：开发中（不可点开假游戏）、可试玩、正式可玩、维护中。显示预期时长、输入方式、是否已缓存。下架游戏不删除存档。

## 公共合同草案

共享界面、头像、纪念品与各游戏美术均允许 AI 重新生成，按 [美术方案](09-ai-art-policy.md) 管理；替换展示资产不改变角色稳定 ID，不覆盖其他游戏仍使用的文件。

以下为需要 P02 冻结的拟定合同，不是现有 API。

| 对象 | 最小字段 | 约束 |
|---|---|---|
| GameManifest | id、title、entry、status、playersMin/Max、networkMode、inputModes、version | ID 稳定，entry 为受控站内相对路径 |
| Character | id、displayName、portrait、source、assetVersion、availability | 不把自走棋费用/强度当跨游戏属性 |
| SaveEnvelope | gameId、slotId、saveVersion、rulesVersion、contentVersion、revision、updatedAt、payload | payload 由游戏自己解释；更新失败保留旧档 |
| Completion | gameId、runId、completionId、rulesVersion、outcome、rewardIds、verification | verification 为 local 或 server；不是客户端自选可信等级 |
| Collectible | id、gameId、title、image、earnedAt、sourceRunId、verification | 稳定 ID；重复结算不重复领取 |
| Profile | localProfileId、displayName、favoriteCharacterId、displaySlots | 不含跨游戏战斗属性 |

拟定本地 SDK：listGames()、getCharacters()、loadSave(gameId,slotId)、saveGame(envelope,expectedRevision)、recordCompletion(completion)、listCollectibles()。异步接口统一返回成功或结构化错误，使未来本地/云适配可替换。写入幂等与多标签页冲突方案在 P02 冻结，不能靠 UI 禁用按钮代替。

## 存档与奖励

- 命名空间 `vtlib:<gameId>:<slotId>`，不覆盖 vc_*、star_survivor_v1 或 RPG 旧键。
- 推荐 IndexedDB 保存新游戏档案和去重记录；存储失败必须提示，不能显示“已保存”。支持带版本号的 JSON 导出/导入；解析、大小限制、字段与游戏 ID 校验后才能写入。
- 自动保存点由各游戏定义；存档先写成功，再显示奖励与“可退出”。结算和奖励需具备重试恢复逻辑。
- 本地档案允许离线收藏；仅服务端验证的玩法能给出 server 标记。不得把旧本地成就迁移为权威线上战绩。
- 云端阶段采用显式选择本地/云副本解决冲突，保留可导出的另一份。禁止用时间戳自动覆盖所有游戏进度。

## 纪念物设计

每款首版给 3 类：首次完成、一个特殊解法/条件、个人最佳或另一结局。G2/G6 不强迫刷唯一最优结局；G7 辅助模式成绩分开标记。展示页首版固定槽位，不做装修碰撞或自由拖拽家具系统。

纪念物可打开来源说明和对应游戏。共享素材错误时使用占位图，不使游戏无法进入。各角色展示来源于白名单，不接入任意远程图片 HTML。

## 网络阶段

P07 先决定身份恢复、房间生命周期和服务复用边界，不能直接挪用现有竞技场单局凭证。P08 首版仅有匿名席位恢复令牌及邀请房间即可；长期账号另在 P09 做。

房间服务验证动作、版本与阶段；消息携带 actionId/revision；仅发送该席位可见视图。邀请链接无管理权限，恢复令牌不进公开 URL 与日志。房间有人数限制、尝试限速、到期策略及主动退出流程。

服务重启首版允许结束临时房，但必须显示“房间已失效”并能重新开局，不能永远加载；若设计选择恢复房间，则补快照一致性验收。多人奖励仅由服务端结果发放。

P09 才接云端个人身份与备份；P10 才接只读展示链接。公开展示默认由用户主动开启，支持撤销，公开对象仅含昵称、本命和所选纪念物。首版不提供任意文本留言和公开聊天。

## 验收

1. 两款单人游戏独立存档；关闭网页后可继续，任一游戏坏档不影响另一款；重复结算仅一份奖励。
2. 本地适配器可在联网服务不可用时使用；只有通过资源缓存断网测试的游戏显示离线可玩。
3. 大厅入口、返回、继续游戏和纪念物来源全链路可走通；新玩家无账号也能完成单人首局。
4. 后续云同步必须测试两设备冲突、掉线重试、导出恢复；分享撤销后旧链接失效。

实施任务：P01–P10，见 [任务清单](tasks/todo.md)。
