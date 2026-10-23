# Pack MES 本地启动与配置手册

更新日期：2026-10-23。适用当前 `Module-PACK-system` 的系统管理、主数据及 Pack 制造作业界面。启动顺序为 PostgreSQL → Spring Boot 后端 → Vite 前端。以下命令用于 macOS 的 zsh/bash；终端中的服务保持前台运行。默认关闭演示初始化，首次自动创建固定内置系统管理员 `admin / admin123`。

## 1. 环境与默认地址

| 组件 | 本机核对版本 | 用途 / 默认地址 |
| --- | --- | --- |
| Java | OpenJDK 21.0.11 | 后端编译、运行，工程指定 Java 21 |
| Maven | 3.9.16 | 后端测试和打包；仓库没有 Maven Wrapper |
| Node.js / npm | 22.21.0 / 10.9.4 | 前端依赖、开发服务和构建 |
| PostgreSQL | 18.4 | 应用库 `127.0.0.1:5432/module_pack_mes`，用户 `mes` |
| 后端 | Spring Boot 3.3.0 | `http://127.0.0.1:8080`，健康检查 `/api/health` |
| 前端 | Vite 5.4.21 | `http://127.0.0.1:5173`，`/api` 代理到后端 |
| Python（可选） | 3.14.0 | 仅 HTTP 业务复现脚本使用，依赖标准库 |

以上版本是本机核对的运行基线，依赖版本以 `backend/pom.xml`、`frontend/package.json` 和锁文件为准。运行本切片不依赖 Redis、消息中间件、Docker 或真实设备。前端和后端分别运行，后端 JAR 不包含前端页面。

在终端检查：

```sh
java -version
mvn -version
node --version
npm --version
psql --version
pg_isready -h 127.0.0.1 -p 5432
```

本机 Homebrew 的 Java 21 可直接使用；若终端选择了其他 JDK，可在运行 Maven 和 Java 的同一终端执行：

```sh
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
```

本机 `/usr/libexec/java_home -V` 未发现已注册 JDK，但 `java -version` 和 `mvn -version` 均识别 Homebrew Java 21；以这两个实际命令的结果为准。

## 2. 首次准备独立数据库

先确认 PostgreSQL 已运行。以下用已有 PostgreSQL 服务，不创建或清空其他项目的数据库。`5432` 是默认端口，使用其他端口时须同步修改后续连接地址。

本机默认实例由 Homebrew 管理且已运行。若该实例未启动，可执行 `brew services start postgresql@18`，再用 `pg_isready` 核对；自行管理或其他端口的实例使用其原启动方式，避免启动第二个实例争用端口。

使用具备创建角色/数据库权限的 PostgreSQL 管理员进入 `psql`。本机管理员通常是初始化数据库时使用的系统用户名；若不同，将 `"$USER"` 换成实际管理员角色：

```sh
psql -X -h 127.0.0.1 -p 5432 -U "$USER" -d postgres
```

在 `psql` 内首次执行：

```sql
CREATE ROLE mes LOGIN;
\password mes
CREATE DATABASE module_pack_mes OWNER mes;
\q
```

`\password` 会提示输入两次数据库密码，稍后将相同密码填入 `.env` 的 `MES_DB_PASSWORD`。若角色或库已经存在，先核对归属，跳过相应创建语句，保留现有密码和数据。应用用户拥有此专用数据库，Liquibase 才能创建/更新表。

验证应用用户连接，按提示输入数据库密码：

```sh
psql -X -h 127.0.0.1 -p 5432 -U mes -d module_pack_mes \
  -c 'select current_database(), current_user;'
```

程序不会创建 PostgreSQL 角色或数据库；首次启动时只在已经存在的目标库内执行 Liquibase 迁移。务必使用 MES 专用库。

## 3. 保存本地配置

进入仓库根目录。路径包含空格，保留引号：

```sh
cd '/Users/wangzilin/Documents/Project-项目库/02.执行中项目/Zencas_锂电模组 Pack 方案/Module-PACK-system'
cp -n .env.example .env
chmod 600 .env
```

如已有 `.env`，直接编辑原文件；`cp -n` 不覆盖已有配置。核对原文件中的 `MES_DEMO_ENABLED` 为 `false`，不会因为复制模板而自动变更旧配置。新库用编辑器填写数据库连接；管理员相关配置可留空：

```sh
MES_DB_URL='jdbc:postgresql://127.0.0.1:5432/module_pack_mes'
MES_DB_USER='mes'
MES_DB_PASSWORD='替换为第2节设置的数据库密码'
MES_PORT=8080
MES_ADMIN_USERNAME=''
MES_ADMIN_PASSWORD=''
MES_ADMIN_TENANT=''
MES_ADMIN_FACTORY=''
MES_DEMO_ENABLED=false
MES_DEMO_PASSWORD=''
```

首次启动创建固定内置账号 `admin`，初始密码 `admin123`，不依赖演示开关。空库默认创建范围 `T1 / T1-F1`；如需其他初始租户、工厂，在首次启动前填写 `MES_ADMIN_TENANT` 和 `MES_ADMIN_FACTORY`。已有 `admin` 保留其原租户范围，重启不覆盖已修改的密码。固定初始密码为首次创建例外，后续修改或重置密码仍需12–200字符。

内置账号拥有固定“系统管理员”角色及所属租户全部工厂的自动授权，并兼容现有工程、操作和质量动作，不跨租户。用户管理中不能更改、停用该账号或修改其角色与工厂；专用角色不可编辑或分配给其他人。本人可在个人设置维护资料、修改密码，只有本人能重置内置账号密码。

`MES_ADMIN_USERNAME`、`MES_ADMIN_PASSWORD` 保留为可选的额外管理员初始化配置，额外账号密码至少12字符；需要此功能时按实际账号、密码及租户/工厂完整填写四项。若账号填写 `admin`，账号与密码两项不参与内置初始化，也不会覆盖固定初始密码。已有普通账号的密码及授权不因重启或改环境变量而恢复；密码维护继续使用用户管理或个人设置。

配置按 shell 语法书写，包含空格、`$`、`#` 等字符的值用单引号包裹；如密码含单引号，需要按 shell 语法转义。`.env` 已被 `.gitignore` 忽略；`.env.example` 仅保留配置项，不含实际密码。

**后端不会自动加载 `.env`**。每次打开新的后端终端，先在仓库根目录显式导出：

```sh
set -a
source .env
set +a
```

前端不用加载这些密码，也没有实现 `VITE_API_URL` 等自定义 API 地址变量。不要将数据库密码、管理员密码或演示密码放入 `VITE_` 变量。

## 4. 启动后端（终端一）

在仓库根目录加载第3节配置后执行：

```sh
cd backend
mvn package
java -jar target/module-pack-mes-0.1.0-SNAPSHOT.jar
```

`mvn package` 已包含自动化测试，无需先重复执行 `mvn test`。首次构建需能下载 Maven 依赖，已有缓存时可复用。看到 `Started MesApplication` 后，仍须等待账号与权限初始化完成，并用第6节的登录检查确认可用；初始化失败会导致应用退出。

开发时也可用 `mvn spring-boot:run` 代替打包后运行，两种启动方式选一种。环境变量须在启动命令所在终端加载。

## 5. 启动前端（终端二）

```sh
cd '/Users/wangzilin/Documents/Project-项目库/02.执行中项目/Zencas_锂电模组 Pack 方案/Module-PACK-system/frontend'
npm ci
npm run dev
```

首次安装或 `package-lock.json` 改变时运行 `npm ci`；平时重启直接 `npm run dev`。默认仅监听 `127.0.0.1:5173`，端口占用时会报错，不自动跳到其他端口。打开 [制造工作空间](http://127.0.0.1:5173)。

## 6. 确认启动成功与登录

在第三个终端执行：

```sh
# 后端健康检查
curl --fail --silent --show-error http://127.0.0.1:8080/api/health
# 通过前端代理访问同一接口
curl --fail --silent --show-error http://127.0.0.1:5173/api/health
# 确认前端 HTML 可访问
curl --fail --silent --show-error --output /dev/null \
  --write-out 'frontend HTTP %{http_code}\n' http://127.0.0.1:5173/
```

两个健康检查均应返回包含 `"status":"UP"`、`"slice":"R1-01"` 的 JSON，前端返回 HTTP 200。健康检查只表示 HTTP 服务可响应，不单独查询数据库；首次使用 `admin / admin123` 登录，已有账号使用本人已设置的密码，确认正确租户、授权工厂和模块菜单。登录页不预填或展示默认密码。首次启动时 HTTP 服务可能先于初始化完成，刚出现 `UP` 就登录可能短暂返回401；等待数秒再试，仍失败再按第10节排查。

新管理员登录后，先在“系统管理 → 用户管理”创建人员或设备/外部MES接入账号，分配角色及工厂。人员可配置多角色，设备和MES账号仅可使用与来源同名的接入角色；账号创建后不能更改来源。继续在主数据中维护工厂资源、物料、产品、工序、路线及SOP，再从制造版本与生产工单进入作业。

演示初始化仅为可选夹具：需要时在专用演示库设置 `MES_DEMO_ENABLED=true` 和至少12字符的 `MES_DEMO_PASSWORD`。它只补充缺失的组织、账号和制造草稿，不清空生产事实；修改该密码不会重置已有账号，关闭开关也不会删除或停用已有账号。固定内置管理员独立初始化，新库无需开启演示或填写额外管理员账号。

登录令牌保存在页面内存，刷新需重新登录。服务器会话默认8小时，退出登录会使当前令牌失效。

## 7. 全部启动配置与改端口

后端配置源为 [`application.properties`](../../backend/src/main/resources/application.properties) 和 [`IdentityBootstrap`](../../backend/src/main/java/com/zencas/mes/admin/IdentityBootstrap.java) 的初始化属性。代码与根目录 `.env.example` 均默认关闭演示模式。

| 配置 | 代码默认值 | 说明 |
| --- | --- | --- |
| `MES_DB_URL` | `jdbc:postgresql://127.0.0.1:5432/module_pack_mes` | JDBC 地址；支持改主机、端口和数据库名 |
| `MES_DB_USER` | `mes` | PostgreSQL 登录角色 |
| `MES_DB_PASSWORD` | 空 | 数据库认证密码，按实际库填写 |
| `MES_PORT` | `8080` | 后端 HTTP 端口 |
| `MES_ADMIN_USERNAME` | 空 | 可选额外管理员账号；填写 `admin` 不覆盖固定内置账号 |
| `MES_ADMIN_PASSWORD` | 空 | 可选额外账号的初始密码，至少12字符；不改变内置 `admin123` 或已有密码 |
| `MES_ADMIN_TENANT` | 空，首次内置初始化采用 `T1` | 内置 `admin` 首次创建的租户范围；已有 `admin` 保留原范围 |
| `MES_ADMIN_FACTORY` | 空，首次内置初始化采用 `T1-F1` | 内置 `admin` 首次创建的初始工厂；后续自动读取同租户全部工厂 |
| `MES_DEMO_ENABLED` | `false` | 显式设为 `true` 才初始化演示数据 |
| `MES_DEMO_PASSWORD` | 空 | 开启演示初始化时必填，至少12字符 |
| `server.address` / `SERVER_ADDRESS` | `127.0.0.1` | 后端监听地址；前者是 Spring 属性，后者是环境变量 |
| `mes.session-hours` | `8` | 会话时长（小时）；可在 JAR 后加 `--mes.session-hours=12` 覆盖 |
| `spring.liquibase.change-log` | `classpath:db/changelog/db.changelog-master.yaml` | 自动执行增量迁移，包含权限、主数据、制造桥接及内置管理员，不需手工导入 SQL |
| `server.error.include-message` | `never` | 不在默认错误响应中暴露内部消息 |
| `spring.jackson.serialization.write-dates-as-timestamps` | `false` | 日期不序列化为数值时间戳 |

`MES_` 配置通过 Spring 属性占位符读取；命令行的 Spring 属性参数可显式覆盖，例如 `java -jar target/module-pack-mes-0.1.0-SNAPSHOT.jar --server.port=8090 --mes.session-hours=12`。无需修改源码或将密码写进 `application.properties`。

| 前端配置 | 当前值 | 调整方式 |
| --- | --- | --- |
| 开发监听地址 | `127.0.0.1` | `package.json` 的 `dev` 命令；也可 `npm run dev -- --host 127.0.0.1` |
| 开发端口 | `5173`，`strictPort: true` | `frontend/vite.config.ts`；或 `npm run dev -- --port 5174` |
| API 代理 | `/api` → `http://127.0.0.1:8080` | 修改 `frontend/vite.config.ts` 的 `server.proxy` 并重启 Vite |
| 构建输出 | `frontend/dist/` | `npm run build` |
| 本地构建预览 | `127.0.0.1:4173` | `npm run preview -- --port 4173 --strictPort`；当前 Vite 继承开发配置的 API 代理 |

若将后端改为 `8090`，须同时完成：

1. 在 `.env` 修改 `MES_PORT=8090`，后端终端重新加载 `.env` 并重启服务。
2. 将 `frontend/vite.config.ts` 中 `/api` 的代理目标改为 `http://127.0.0.1:8090`，重启前端。
3. 健康检查使用新端口；运行复现脚本时设置 `MES_BASE_URL=http://127.0.0.1:8090`。

仅修改后端环境变量不会自动更新 Vite 代理。只改数据库端口则只需改 JDBC 地址，不改变 HTTP 代理。

## 8. 后续启动、停止与数据保留

数据库已准备、依赖和 JAR 未变化时，日常启动仅需两个终端：

```sh
# 终端一：仓库根目录
set -a
source .env
set +a
cd backend
java -jar target/module-pack-mes-0.1.0-SNAPSHOT.jar
```

```sh
# 终端二：仓库根目录
cd frontend
npm run dev
```

修改后端源码后重新 `mvn package` 再启动 JAR；修改前端源码由 Vite 热更新，修改依赖后重新 `npm ci`，修改代理后重启前端。

停止时在前端、后端各自终端按 `Ctrl+C`。业务数据保存在配置指向的 PostgreSQL 库内，停止这两个进程不会删除数据。共享 PostgreSQL 服务可以保持运行；如确需停止，使用管理该实例的工具，先确认没有其他项目依赖它。排查占用可用 `lsof -nP -iTCP:8080 -sTCP:LISTEN` 和 `lsof -nP -iTCP:5173 -sTCP:LISTEN`；先识别进程归属，再回到相应终端停止。

上次实现验收使用了 `127.0.0.1:55432` 和 `/tmp/zencas-r1-postgres/data` 的临时 PostgreSQL 实例。需要继续原数据时，应沿用原数据库名、用户和密码，将 `MES_DB_URL` 的端口设为 `55432`，不要误连默认 `5432` 的新库。可先 `pg_isready -h 127.0.0.1 -p 55432`；实例已停止且原目录仍在时，用与原数据目录匹配的 PostgreSQL 18 工具启动：

```sh
pg_ctl -D /tmp/zencas-r1-postgres/data \
  -l /tmp/zencas-r1-postgres/postgres.log \
  -o '-h 127.0.0.1 -p 55432 -k /tmp/zencas-r1-postgres/socket' start
```

这条恢复命令仅适用于原临时实例，且要求原 `socket` 目录仍在、端口空闲；实例已运行时不要重复启动或重新 `initdb`。本手册不写入或重置原密码；临时目录可能被系统清理，需要长期保留的数据应迁移到持久目录或专用数据库，并单独安排备份。

## 9. 自动检查与可选业务复现

分别在对应目录执行：

```sh
# backend/
mvn test
# frontend/
npm test
npm run build
```

后端测试使用独立 H2 库，不写运行中的 PostgreSQL 库。`mvn package` 同时执行测试和打包。前端构建只生成静态文件；`npm run preview -- --port 4173 --strictPort` 可用于本地检查构建产物，后端仍需启动。当前没有生产部署脚本；实际部署须同时提供静态文件服务和 `/api` 反向代理，不能仅运行 JAR 或将开发服务作为生产部署完成证明。

需要重走业务主链时，使用**新建的专用演示库**，启用演示数据并启动后端。下列脚本会写入演示工单、对象、测试和放行记录，不是只读健康检查；已有业务数据的库不要重复执行 `run`。在仓库根目录加载 `.env` 后运行：

```sh
cd backend
export MES_BASE_URL="http://127.0.0.1:${MES_PORT:-8080}"
python3 scripts/verify-demo.py --phase run --evidence /tmp/module-pack-r1-evidence.json
# 先停止并重启同一个后端，保持数据库和配置不变，再执行：
python3 scripts/verify-demo.py --phase replay --evidence /tmp/module-pack-r1-evidence.json
```

脚本读取 `MES_DEMO_PASSWORD` 和 `MES_BASE_URL`（默认 `http://127.0.0.1:8080`），仅接受本机 HTTP 源，不跟随重定向。`run` 要求证据文件尚不存在；`replay` 必须使用原证据文件和原数据库。证据不保存密码/令牌；保留文件以便重启后核对，勿覆盖仓库中已有的历史验收证据。完整业务顺序和限制见[实现契约](r1-01-implementation.md)。

## 10. 常见启动问题

| 现象 | 核查与处理 |
| --- | --- |
| Maven 提示 `release version 21 not supported` | 检查 `mvn -version` 中的 Java，按第1节指定 Java 21 |
| PostgreSQL 连接拒绝 / 超时 | 检查实例、JDBC 主机和端口，先运行 `pg_isready`；区分默认5432与旧临时库55432 |
| `database ... does not exist` / `role ... does not exist` | 按第2节用管理员创建专用库/角色，应用不会代建 |
| 数据库密码错误 / schema 权限错误 | 核对 `.env`、应用库所属用户，使用 `psql` 独立验证；不要通过重建已有库处理 |
| 提示演示密码至少12字符 | 确认当前终端已 `source .env` 并导出变量；启用演示时每次启动都会检查 |
| 提示额外管理员初始化配置不完整 | 使用可选额外账号时完整填写四项 `MES_ADMIN_*`；只使用内置 `admin` 时账号和密码两项留空 |
| 能打开页面但登录401 | 核对连接的数据库、指定初始化账号或已有账号的状态与密码；改 `.env` 不会重置已有密码 |
| 5173 / 8080 已被占用 | 识别占用服务；按第7节调整端口及代理，避免停止其他项目 |
| 页面可打开，`/api` 报代理错误或非JSON响应 | 先测后端健康接口，再测前端代理；检查目标端口，修改配置后重启 Vite |
| 刷新后回到登录页 | 当前会话仅在内存，属于现有行为，重新登录即可 |
| 使用复现工具提示工厂已有执行事实 / 证据已存在 | 另建专用演示库和新证据路径，不清空已有事实来重跑 |

## 11. 早期R1-01启动验证历史记录

以下记录保留2026-10-23早期R1-01切片的启动验证结果，当时使用演示预设；它不是当前管理界面改造后的测试计数或默认启动配置。当前启动按第3至6节执行。

| 检查 | 结果 |
| --- | --- |
| 后端 `mvn package` | 14项测试通过，JAR打包成功 |
| 前端 `npm test` / `npm run build` | 6项测试通过，TypeScript与Vite构建成功 |
| 配置加载及数据库初始化 | 临时副本填写随机密码，由zsh显式导出；专用PostgreSQL 18库的密码认证及3项Liquibase迁移通过 |
| HTTP启动链路 | 后端8080、前端5173页面及`/api`代理均通过；8个演示身份均能登录并读取授权工厂状态 |
| 业务与重启 | `verify-demo.py --phase run`通过；重启同一JAR/数据库后`--phase replay`通过，业务计数保持一致 |
| 构建产物预览 | 4173的HTML及继承的`/api`代理通过 |
| 文档 | 本地链接有效；shell命令块通过zsh/bash语法检查 |

本节验证仅在独立临时数据库55433进行，未修改已有5432或55432实例的数据，也未覆盖仓库历史验收证据。当次临时前后端及数据库进程均已停止，未生成根目录实际`.env`。此次使用HTTP接口核对启动与登录，未新增浏览器交互或真实设备验收。随后按使用者要求启动的本机实例见下一节。

## 12. 已有本机数据库与账号

先前本机运行沿用的数据库为 `jdbc:postgresql://127.0.0.1:55432/r1_mes`，用户 `mes`，数据目录为 `/tmp/zencas-r1-postgres/data`。这是识别原实例的历史信息，实际是否运行须核对进程、监听和健康接口，不以文档代替实时状态。

| 项目 | 配置位置 / 核对方式 |
| --- | --- |
| 前后端地址 | 第1节默认地址；变更后按第7节核对 |
| 本机环境配置 | 仓库根目录 `.env`，权限600，Git忽略 |
| 登录资料 | 使用本人保管的现有账号资料，本手册不展示旧本地账号或密码 |
| 日志 | `/tmp/zencas-module-pack-runtime/backend.log`、`frontend.log` |
| 进程记录 | 同目录 `backend.pid`、`frontend.pid`；仍须核对实际进程及监听 |

已有数据库升级时继续使用原数据库连接及账号，先将 `MES_DEMO_ENABLED` 设为 `false`。四项 `MES_ADMIN_*` 可全部留空，Liquibase执行增量迁移并确保固定内置管理员存在；已有 `admin` 保留原租户范围和密码，其他账号的授权不因该专用角色改变。已有工单、装配、检测、返修和放行事实继续保留。

本机 `MES_LOCAL_*` 项如仍存在，仅为原使用者保存的登录资料，应用不会读取它们来创建或重置账号。账号维护使用系统管理和个人设置。长期数据保留及原临时实例恢复注意事项见第8节。

## 13. 新库首次业务配置与作业入口

以下流程用于内置管理员首次登录后的新库，不依赖演示账号或 `DEMO-*` 制造版本。页面中选择当前租户的工厂，使用实际业务编码维护资料。

1. **系统管理 → 组织管理、用户管理、角色与权限**：维护行政组织，创建人员账号并分配工厂。普通人员按实际职责分配生产操作员或质量人员；固定内置系统管理员已兼容现有工程、操作和质量动作，无需额外分配角色。
2. **主数据 → 工厂资源**：维护工厂、车间、产线及装配/检测工位；建工单时选择实际产线，作业进站时选择属于该产线的工位。
3. **主数据 → 物料、产品**：建立电芯及模组/PACK物料，发布物料版本，从半成品或成品物料派生产品。每个装配位置配置实际物料，作业绑定和换芯按冻结BOM校验料号。
4. **主数据 → 文档/SOP、工序、工艺路线**：上传受控文件并发布文档版本；配置装配与检测工序，路线引用指定SOP版本后发布。
5. **系统管理 → 用户管理、主数据 → 设备台账**：需要设备或外部MES上报时，新建对应来源的接入账号，分配同名接入角色及工厂，在设备台账配置来源账号和通道。接入账号通过登录接口获取令牌，其非检测业务写入会被拒绝。
6. **生产管理 → 制造版本、生产工单**：选择产品、已发布物料/路线版本，配置BOM位置、检测项、来源及通道，校验后发布制造版，再建工单。PACK工单需指定获授权的模组来源工单；已发布制造版及既有工单保留冻结上下文。
7. **生产管理 → 生产对象、生产作业**：创建序列化对象，接收电芯，在工位扫码进站；按位置绑定子件、记录人工检查并完成装配，再打开检测访问。检测报文使用制造版配置的通道及真实访问快照，由授权接入身份提交。
8. **质量管理、全程追溯**：NG后按授权返修执行换芯和复测。人工NG保留的OPEN装配访问需在当前装配版本重新人工检查OK并完成后再检测；检验合格后关闭返修、执行放行并核对谱系及历史证据。

内置管理员提供当前租户的管理及已有作业入口，不会自动创建生产工单或设备结果。可选演示夹具与自动HTTP复现见第9节；使用专用演示库，不将预置数据作为日常配置来源。
