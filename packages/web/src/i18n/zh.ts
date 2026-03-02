export const zh: Translations = {
  header: {
    newTask: '新建任务',
    settings: '设置',
  },
  config: {
    title: '设置',
    interfaceSettings: '界面设置',
    language: '语言',
    theme: '主题',
    darkMode: '暗色模式',
    lightMode: '亮色模式',
    account: '账户',
    logout: '退出登录',
    confirmLogout: '确定退出登录？',
    repoManagement: '仓库管理',
    addRepo: '添加仓库',
    noRepos: '暂无仓库，点击上方按钮添加',
    concurrency: '并发:',
    edit: '编辑',
    delete: '删除',
    confirmDeleteRepo: (name: string) => `确定删除仓库 "${name}"？`,
    about: '关于',
    aboutTitle: 'VibeCoding 编排中心 v0.1.0',
    aboutDesc: '基于胡渊鸣《我给 10 个 Claude Code 打工》构建的并行化开发工具',
    repoName: '仓库名称',
    repoPath: '本地路径',
    mainBranch: '主分支',
    maxConcurrency: '最大并发',
    fillRequired: '请填写所有必填项',
    saving: '保存中...',
    save: '保存',
    add: '添加',
    cancel: '取消',
  },
  taskForm: {
    title: '新建任务',
    promptLabel: '任务提示词',
    promptPlaceholder: '描述你希望 Claude Code 完成的任务...',
    titleLabel: '任务标题',
    titleOptional: '(可选)',
    titlePlaceholder: '简短描述，用于列表展示',
    thinkingMode: '思考模式',
    thinkingModeDesc: '启用后 Claude 会进行更深入的推理',
    predecessorTask: '前置任务',
    noPredecessor: '无前置任务',
    predecessorDesc: '新任务将在前置任务完成后才开始执行',
    advancedSettings: '高级设置',
    model: '模型',
    modelDefault: (m: string) => `默认 (${m})`,
    maxBudget: '最大预算 (USD)',
    interactionTimeout: '交互超时 (秒)',
    taskLanguage: '任务语言',
    taskLanguageDesc: 'Claude Code 执行任务时使用的语言',
    langZh: '中文',
    langEn: 'English',
    createTask: '创建任务',
    creating: '创建中...',
    cancel: '取消',
    promptRequired: '请输入任务提示词',
  },
  restartDialog: {
    title: '重启任务',
    promptLabel: '任务指令',
    titleLabel: '任务标题',
    titleOptional: '(可选)',
    titlePlaceholder: '简短描述，用于列表展示',
    model: '模型',
    maxBudget: '最大预算 (USD)',
    interactionTimeout: '交互超时 (秒)',
    thinkingMode: '思考模式',
    thinkingModeDesc: '启用后 Claude 会进行更深入的推理',
    taskLanguage: '任务语言',
    langZh: '中文',
    langEn: 'English',
    promptRequired: '任务指令不能为空',
    restarting: '重启中...',
    confirmRestart: '确认重启',
    cancel: '取消',
  },
  taskDetail: {
    thinkingMode: '思考模式',
    untitled: '未命名任务',
    prompt: '提示词',
    createdAt: '创建时间',
    startedAt: '开始时间',
    duration: '耗时',
    cost: '费用',
    branch: '分支',
    errorMessage: '错误信息',
    result: '执行结果',
    awaitingConfirm: '等待确认',
    logs: '日志',
    pastInteractions: '历史交互',
    question: '问题',
    answer: '回答',
    answered: '已回答',
    timedOut: '已超时',
    seconds: '秒',
    minutes: '分',
    hours: '时',
    config: '任务配置',
    configModel: '模型',
    configBudget: '预算上限',
    configTimeout: '交互超时',
    configLanguage: '任务语言',
    configThinking: '思考模式',
    configPredecessor: '前置任务',
    configEnabled: '开启',
    configDisabled: '关闭',
    configNone: '无',
    configSeconds: '秒',
  },
  taskCard: {
    justNow: '刚刚',
    minutesAgo: (n: number) => `${n} 分钟前`,
    hoursAgo: (n: number) => `${n} 小时前`,
    confirmCancel: '确定取消此任务？',
    confirmDelete: '确定删除此任务？',
    cancelTask: '取消任务',
    deleteTask: '删除任务',
    restartTask: '重启任务',
  },
  taskList: {
    board: '看板',
    waiting: '待运行',
    running: '运行中',
    awaiting: '待确认',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    noTasks: '暂无任务',
    createFirst: '创建第一个任务',
    confirmClear: (label: string) => `确定清空所有${label}的任务？`,
    clearCompleted: (n: number) => `清空已完成 (${n})`,
    clearFailed: (n: number) => `清空失败 (${n})`,
    clearCancelled: (n: number) => `清空已取消 (${n})`,
    clearColumn: (label: string) => `清空${label}`,
  },
  status: {
    PENDING: '等待中',
    QUEUED: '排队中',
    RUNNING: '运行中',
    AWAITING_INPUT: '待确认',
    COMPLETED: '已完成',
    FAILED: '失败',
    CANCELLED: '已取消',
  },
  dashboard: {
    noRepos: '暂无仓库',
    selectRepo: '请选择一个仓库',
    addRepoFirst: '请先在设置中添加仓库',
    selectFromDropdown: '从顶部下拉菜单选择要管理的仓库',
    openSettings: '打开设置',
  },
  auth: {
    title: 'VibeCoding',
    subtitle: '编排中心 - 请输入访问令牌',
    tokenLabel: '访问令牌',
    tokenPlaceholder: '输入 config.yaml 中配置的 authToken',
    invalidToken: '令牌无效或服务器无法连接',
    validating: '验证中...',
    login: '登录',
    tokenRequired: '请输入访问令牌',
  },
  confirm: {
    title: '确认操作',
    cancel: '取消',
    confirm: '确认',
  },
  logViewer: {
    noLogs: '暂无日志',
  },
  userConfirm: {
    placeholder: '输入回答...',
  },
  repoSelector: {
    selectRepo: '选择仓库',
    noRepos: '暂无仓库',
    newRepo: '新建仓库',
  },
  common: {
    cancel: '取消',
    save: '保存',
    add: '添加',
    language: '语言',
    zh: '中文',
    en: 'English',
  },
};

export interface Translations {
  header: {
    newTask: string;
    settings: string;
  };
  config: {
    title: string;
    interfaceSettings: string;
    language: string;
    theme: string;
    darkMode: string;
    lightMode: string;
    account: string;
    logout: string;
    confirmLogout: string;
    repoManagement: string;
    addRepo: string;
    noRepos: string;
    concurrency: string;
    edit: string;
    delete: string;
    confirmDeleteRepo: (name: string) => string;
    about: string;
    aboutTitle: string;
    aboutDesc: string;
    repoName: string;
    repoPath: string;
    mainBranch: string;
    maxConcurrency: string;
    fillRequired: string;
    saving: string;
    save: string;
    add: string;
    cancel: string;
  };
  taskForm: {
    title: string;
    promptLabel: string;
    promptPlaceholder: string;
    titleLabel: string;
    titleOptional: string;
    titlePlaceholder: string;
    thinkingMode: string;
    thinkingModeDesc: string;
    predecessorTask: string;
    noPredecessor: string;
    predecessorDesc: string;
    advancedSettings: string;
    model: string;
    modelDefault: (m: string) => string;
    maxBudget: string;
    interactionTimeout: string;
    taskLanguage: string;
    taskLanguageDesc: string;
    langZh: string;
    langEn: string;
    createTask: string;
    creating: string;
    cancel: string;
    promptRequired: string;
  };
  restartDialog: {
    title: string;
    promptLabel: string;
    titleLabel: string;
    titleOptional: string;
    titlePlaceholder: string;
    model: string;
    maxBudget: string;
    interactionTimeout: string;
    thinkingMode: string;
    thinkingModeDesc: string;
    taskLanguage: string;
    langZh: string;
    langEn: string;
    promptRequired: string;
    restarting: string;
    confirmRestart: string;
    cancel: string;
  };
  taskDetail: {
    thinkingMode: string;
    untitled: string;
    prompt: string;
    createdAt: string;
    startedAt: string;
    duration: string;
    cost: string;
    branch: string;
    errorMessage: string;
    result: string;
    awaitingConfirm: string;
    logs: string;
    pastInteractions: string;
    question: string;
    answer: string;
    answered: string;
    timedOut: string;
    seconds: string;
    minutes: string;
    hours: string;
    config: string;
    configModel: string;
    configBudget: string;
    configTimeout: string;
    configLanguage: string;
    configThinking: string;
    configPredecessor: string;
    configEnabled: string;
    configDisabled: string;
    configNone: string;
    configSeconds: string;
  };
  taskCard: {
    justNow: string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    confirmCancel: string;
    confirmDelete: string;
    cancelTask: string;
    deleteTask: string;
    restartTask: string;
  };
  taskList: {
    board: string;
    waiting: string;
    running: string;
    awaiting: string;
    completed: string;
    failed: string;
    cancelled: string;
    noTasks: string;
    createFirst: string;
    confirmClear: (label: string) => string;
    clearCompleted: (n: number) => string;
    clearFailed: (n: number) => string;
    clearCancelled: (n: number) => string;
    clearColumn: (label: string) => string;
  };
  status: {
    PENDING: string;
    QUEUED: string;
    RUNNING: string;
    AWAITING_INPUT: string;
    COMPLETED: string;
    FAILED: string;
    CANCELLED: string;
  };
  dashboard: {
    noRepos: string;
    selectRepo: string;
    addRepoFirst: string;
    selectFromDropdown: string;
    openSettings: string;
  };
  auth: {
    title: string;
    subtitle: string;
    tokenLabel: string;
    tokenPlaceholder: string;
    invalidToken: string;
    validating: string;
    login: string;
    tokenRequired: string;
  };
  confirm: {
    title: string;
    cancel: string;
    confirm: string;
  };
  logViewer: {
    noLogs: string;
  };
  userConfirm: {
    placeholder: string;
  };
  repoSelector: {
    selectRepo: string;
    noRepos: string;
    newRepo: string;
  };
  common: {
    cancel: string;
    save: string;
    add: string;
    language: string;
    zh: string;
    en: string;
  };
}
