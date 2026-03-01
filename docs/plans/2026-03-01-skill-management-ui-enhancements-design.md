# Skill 管理 UI 增强设计

**日期：** 2026-03-01
**状态：** 已批准

## 需求概述

1. **默认收起全部**：Skill 分类列表默认全部收起，减少初始视觉噪音
2. **下载 Skill 文件**：每个 Skill 可打包为 `.skill` 文件下载，调用 `skills/skill-creator/scripts/package_skill.py`
3. **导入 Skill 文件**：在现有「从 GitHub 安装」弹窗中增加「从文件导入」Tab，支持上传 `.skill` 文件

---

## 架构与组件设计

### 1. 默认收起全部

**文件：** `web-ui/src/components/SkillManagementSection.tsx`

将 `expandedCategories` 的初始 state 从全展开改为空集合：

```diff
- useState<Set<string>>(new Set(SKILL_CATEGORIES.map(c => c.id)))
+ useState<Set<string>>(new Set())
```

---

### 2. 下载 Skill 文件

#### 后端 API

**新增：** `GET /api/skills/:name/download`

```
流程：
1. skillsLoader.get(name) → 获取 skill.filePath（指向 SKILL.md）
2. path.dirname(filePath)  → 得到 skill 文件夹路径
3. 用临时目录调用 Python 脚本：
   python3 skills/skill-creator/scripts/package_skill.py <skillDir> <tmpDir>
4. 以 application/octet-stream 返回 .skill 文件
5. 响应结束后清理临时文件
```

错误处理：
- skill 不存在 → 404
- 脚本执行失败（验证不通过）→ 500 + 错误信息
- filePath 为空 → 400

#### 前端

**文件：** `web-ui/src/components/SkillManagementSection.tsx`

在 `SkillItem` 组件中，Toggle 开关旁边加下载图标按钮（`Download` from lucide-react）。

- 点击 → `GET /api/skills/:name/download`，通过创建临时 `<a>` 标签触发浏览器下载
- 下载中显示加载状态（`Loader2` 旋转图标）
- 下载失败显示短暂错误提示

`SkillItem` props 扩展：

```typescript
interface SkillItemProps {
  skill: Skill;
  onToggle: (name: string) => void;
  onDownload: (name: string) => void;  // 新增
  loading: boolean;
  downloading?: boolean;               // 新增：下载中状态
}
```

---

### 3. 从文件导入（扩展现有安装弹窗）

#### 后端 API

**新增：** `POST /api/skills/upload`

- 使用 `multer` 处理 `multipart/form-data`，字段名 `file`
- 只接受 `.skill` 文件（Content-Type 或扩展名校验）
- 将 `.skill` 文件（zip 格式）解压到 `skillsDir`
- 解压后调用 `skillsLoader.reload()`
- 返回 `{ success: true, installed: [skillName] }`

**依赖：** 需要确认 `multer` 是否已安装，如无则添加

#### 前端

**文件：** `web-ui/src/components/InstallSkillModal.tsx`

在弹窗顶部增加 Tab 切换（`GitHub` | `从文件导入`）：

```
Tab: GitHub（现有逻辑不变）
Tab: 从文件导入（新增）
  - 拖拽区域 / 文件选择按钮
  - 只接受 .skill 文件
  - 上传后进入 loading → success/error（复用现有状态机）
  - success 后提供「立即启用」/ 「稍后」同现有逻辑
```

**新增状态：**

```typescript
type InstallTab = 'github' | 'file';
const [tab, setTab] = useState<InstallTab>('github');
```

文件上传函数 `handleFileUpload(file: File)` → `POST /api/skills/upload` → 同 `handleInstall` 的状态流转。

---

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `web-ui/src/components/SkillManagementSection.tsx` | 修改 | 默认收起 + 下载按钮 + downloading 状态 |
| `web-ui/src/components/InstallSkillModal.tsx` | 修改 | 增加文件导入 Tab + 上传逻辑 |
| `src/channels/http-ws/http-server.ts` | 修改 | 新增 download 和 upload 两个 API endpoint |
| `package.json`（根目录） | 可能修改 | 如 multer 未安装则添加 |

---

## 数据流

```
下载流：
Frontend SkillItem [Download] → GET /api/skills/:name/download
  → skillsLoader.get(name).skill.filePath
  → dirname(filePath) = skillDir
  → spawn python3 package_skill.py skillDir /tmp/xxx
  → pipe .skill file to response
  → cleanup /tmp/xxx

上传流：
Frontend InstallModal [文件Tab] → POST /api/skills/upload (multipart)
  → multer 保存到临时目录
  → unzip .skill → skillsDir/<skillName>/
  → skillsLoader.reload()
  → return { success, installed }
  → Frontend: 同 GitHub 安装的成功流程
```

---

## 注意事项

- `package_skill.py` 内部会调用 `quick_validate.py` 进行验证，验证失败时脚本返回非 0 exit code，后端需捕获并返回友好错误
- 上传的文件大小应限制（建议 10MB），防止滥用
- 下载 API 需要和其他 skill API 一样通过认证中间件保护
