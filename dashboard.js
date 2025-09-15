// 常量定义
const CONFIG_KEYS = {
    MODEL_NAME: 'modelName',
    API_URL: 'apiUrl',
    API_KEY: 'apiKey',
    TIMEOUT: 'timeout'
};

const RISK_LEVELS = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
};

// 应用状态
let isAnalyzing = false;
let analysisAborted = false;

let isAIAnalyzing = false;

// 中断控制器，用于停止AI流式响应
let currentAbortController = null;

// 分批分析相关
const BATCH_SIZE = 500; // 每批处理的记录数
let currentBatch = 0;
let totalBatches = 0;
let batchResults = []; // 存储每批的分析结果
let allUserData = []; // 存储所有用户数据
let combinedRiskLevel = null; // 存储最终的综合风险等级

// DOM 元素
const elements = {};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    initializeEventListeners();
    loadSavedConfig();
    checkCurrentSite();
    checkAIConnection();
    initializeCurrentUser(); // 初始化当前用户信息
    
    // 设置页面标题
    document.title = 'RiskLens 风险透镜 - 个人信息泄露风险分析';
});

// 初始化DOM元素
function initializeElements() {
    // 头部元素
    elements.settingsBtn = document.getElementById('settingsBtn');
    elements.connectionStatus = document.getElementById('connectionStatus');
    elements.statusText = document.getElementById('statusText');
    
    // 配置相关
    elements.configPrompt = document.getElementById('configPrompt');
    elements.openConfigBtn = document.getElementById('openConfigBtn');
    elements.configModal = document.getElementById('configModal');
    elements.closeConfigModal = document.getElementById('closeConfigModal');
    elements.modelName = document.getElementById('modelName');
    elements.apiUrl = document.getElementById('apiUrl');
    elements.apiKey = document.getElementById('apiKey');
    elements.timeout = document.getElementById('timeout');
    elements.saveConfig = document.getElementById('saveConfig');
    elements.testConnection = document.getElementById('testConnection');
    elements.testResult = document.getElementById('testResult');
    elements.testStatus = document.getElementById('testStatus');
    
    // 分析相关
    elements.username = document.getElementById('username');
    elements.currentUserDisplay = document.getElementById('current-user-display');
    elements.refreshUserBtn = document.getElementById('refreshUserBtn');
    elements.startAnalysis = document.getElementById('startAnalysis');
    elements.stopAnalysis = document.getElementById('stopAnalysis');
    elements.progressSection = document.getElementById('progressSection');
    elements.progressText = document.getElementById('progressText');
    elements.progressCount = document.getElementById('progressCount');
    elements.progressFill = document.getElementById('progressFill');
    elements.progressBar = document.getElementById('progressBar');
    elements.resultsSection = document.getElementById('resultsSection');
    elements.riskSummary = document.getElementById('riskSummary');
    elements.riskDetails = document.getElementById('riskDetails');
    elements.recommendations = document.getElementById('recommendations');
    elements.reportContent = document.getElementById('reportContent');
    elements.loadingOverlay = document.getElementById('loadingOverlay');
    elements.exportReport = document.getElementById('exportReport');
    elements.analysisStatus = document.getElementById('analysisStatus');
    elements.analysisSubstatus = document.getElementById('analysisSubstatus');
    elements.step1 = document.getElementById('step1');
    elements.step2 = document.getElementById('step2');
    elements.step3 = document.getElementById('step3');
    
    
    // AI流式响应元素
    elements.aiResponseDisplay = document.getElementById('aiResponseDisplay');
    elements.aiResponseText = document.getElementById('aiResponseText');
    elements.charCount = document.getElementById('charCount');
    elements.statusText = document.getElementById('statusText');
    
    // 滚动容器（延迟获取以确保元素已渲染）
    setTimeout(() => {
        if (elements.aiResponseDisplay) {
            elements.responseContent = elements.aiResponseDisplay.querySelector('.response-content');
        }
    }, 100);
    
    // 批次控制元素
    elements.batchControls = document.getElementById('batchControls');
    elements.batchSummary = document.getElementById('batchSummary');
    elements.batchTabs = document.getElementById('batchTabs');
}

// 初始化事件监听器
function initializeEventListeners() {
    // 设置按钮
    elements.settingsBtn.addEventListener('click', openConfigModal);
    elements.openConfigBtn.addEventListener('click', openConfigModal);
    
    // 模态窗口
    elements.closeConfigModal.addEventListener('click', closeConfigModal);
    // 移除点击空白处关闭模态窗口的功能
    
    // 配置相关
    elements.saveConfig.addEventListener('click', saveConfiguration);
    elements.testConnection.addEventListener('click', testAIConnection);
    
    // 分析控制
    elements.startAnalysis.addEventListener('click', startAnalysis);
    elements.stopAnalysis.addEventListener('click', stopAnalysis);
    elements.refreshUserBtn.addEventListener('click', handleRefreshUser);
    
    // 导出报告
    elements.exportReport.addEventListener('click', exportReport);
    
    // 输入验证
    elements.apiUrl.addEventListener('blur', validateApiUrl);
    elements.apiKey.addEventListener('input', validateApiKey);
    
    // ESC键关闭模态窗口
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.configModal.style.display !== 'none') {
            closeConfigModal();
        }
    });
    
    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
        // 清理资源
    });
}

// 检查当前网站 - 标签页版本需要检查所有标签页
async function checkCurrentSite() {
    try {
        // 检查URL参数是否有用户名
        const urlParams = new URLSearchParams(window.location.search);
        const usernameParam = urlParams.get('username');
        if (usernameParam) {
            elements.username.value = usernameParam;
        }
        
        // 尝试获取当前活动标签页的信息
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('linux.do')) {
            // 尝试从当前URL提取用户名
            const match = tabs[0].url.match(/\/u\/([^\/]+)/);
            if (match && !usernameParam) {
                elements.username.value = match[1];
            }
        }
    } catch (error) {
        console.warn('获取当前标签页信息失败:', error);
    }
}

// 配置相关功能
function openConfigModal() {
    elements.configModal.style.display = 'flex';
    // 聚焦到第一个输入框
    setTimeout(() => {
        elements.modelName.focus();
    }, 100);
}

function closeConfigModal() {
    elements.configModal.style.display = 'none';
    // 隐藏测试结果
    elements.testResult.style.display = 'none';
}

async function loadSavedConfig() {
    try {
        const config = await chrome.storage.sync.get(Object.values(CONFIG_KEYS));
        
        elements.modelName.value = config[CONFIG_KEYS.MODEL_NAME] || '';
        elements.apiUrl.value = config[CONFIG_KEYS.API_URL] || '';
        elements.apiKey.value = config[CONFIG_KEYS.API_KEY] || '';
        elements.timeout.value = config[CONFIG_KEYS.TIMEOUT] || 30;
        
        // 检查是否首次使用（配置为空）
        const isFirstTime = !config[CONFIG_KEYS.MODEL_NAME] || !config[CONFIG_KEYS.API_URL] || !config[CONFIG_KEYS.API_KEY];
        if (isFirstTime) {
            showConfigPrompt(true);
        }
    } catch (error) {
        showNotification('加载配置失败', 'error');
        showConfigPrompt(true);
    }
}

async function saveConfiguration() {
    const config = {
        [CONFIG_KEYS.MODEL_NAME]: elements.modelName.value.trim(),
        [CONFIG_KEYS.API_URL]: elements.apiUrl.value.trim(),
        [CONFIG_KEYS.API_KEY]: elements.apiKey.value.trim(),
        [CONFIG_KEYS.TIMEOUT]: parseInt(elements.timeout.value) || 30
    };
    
    // 验证配置
    if (!validateConfiguration(config)) {
        return;
    }
    
    try {
        await chrome.storage.sync.set(config);
        showNotification('配置保存成功', 'success');
        
        // 关闭模态窗口
        setTimeout(() => {
            closeConfigModal();
        }, 1000);
        
        // 隐藏配置提示
        showConfigPrompt(false);
        
        // 重新检测连接
        setTimeout(() => {
            checkAIConnection();
        }, 500);
        
    } catch (error) {
        showNotification('配置保存失败', 'error');
    }
}

function validateConfiguration(config) {
    if (!config[CONFIG_KEYS.MODEL_NAME]) {
        showNotification('请输入模型名称', 'warning');
        elements.modelName.focus();
        return false;
    }
    
    if (!config[CONFIG_KEYS.API_URL]) {
        showNotification('请输入API地址', 'warning');
        elements.apiUrl.focus();
        return false;
    }
    
    if (!isValidUrl(config[CONFIG_KEYS.API_URL])) {
        showNotification('请输入有效的API地址', 'warning');
        elements.apiUrl.focus();
        return false;
    }
    
    if (!config[CONFIG_KEYS.API_KEY]) {
        showNotification('请输入API密钥', 'warning');
        elements.apiKey.focus();
        return false;
    }
    
    return true;
}

function validateApiUrl() {
    const url = elements.apiUrl.value.trim();
    if (url && !isValidUrl(url)) {
        elements.apiUrl.style.borderColor = '#e74c3c';
        showNotification('请输入有效的URL地址', 'warning');
    } else {
        elements.apiUrl.style.borderColor = '';
    }
}

function validateApiKey() {
    const key = elements.apiKey.value.trim();
    const strength = getApiKeyStrength(key);
    
    // 可以添加密钥强度提示
    if (key.length > 0 && key.length < 10) {
        elements.apiKey.style.borderColor = '#f39c12';
    } else {
        elements.apiKey.style.borderColor = '';
    }
}

// AI连接测试功能
async function checkAIConnection() {
    try {
        const config = await chrome.storage.sync.get(Object.values(CONFIG_KEYS));
        
        // 如果配置不完整，显示提示
        if (!config[CONFIG_KEYS.MODEL_NAME] || !config[CONFIG_KEYS.API_URL] || !config[CONFIG_KEYS.API_KEY]) {
            updateConnectionStatus('disconnected', '未配置AI服务');
            showConfigPrompt(true);
            return;
        }
        
        updateConnectionStatus('testing', '正在检测连接...');
        
        // 执行连接测试
        const testResult = await performConnectionTest(config);
        
        if (testResult.success) {
            updateConnectionStatus('connected', 'AI服务连接正常');
            showConfigPrompt(false);
        } else {
            updateConnectionStatus('disconnected', `连接失败: ${testResult.error}`);
            showConfigPrompt(true);
        }
        
    } catch (error) {
        console.error('AI连接检测失败:', error);
        updateConnectionStatus('disconnected', '连接检测失败');
        showConfigPrompt(true);
    }
}

async function testAIConnection() {
    const config = {
        [CONFIG_KEYS.MODEL_NAME]: elements.modelName.value.trim(),
        [CONFIG_KEYS.API_URL]: elements.apiUrl.value.trim(),
        [CONFIG_KEYS.API_KEY]: elements.apiKey.value.trim(),
        [CONFIG_KEYS.TIMEOUT]: parseInt(elements.timeout.value) || 30
    };
    
    // 验证配置
    if (!validateConfiguration(config)) {
        return;
    }
    
    // 显示测试结果区域
    elements.testResult.style.display = 'block';
    updateTestStatus('testing', '正在测试连接...', 'fas fa-spinner fa-spin');
    
    try {
        const result = await performConnectionTest(config);
        
        if (result.success) {
            updateTestStatus('success', '连接测试成功！AI服务可用', 'fas fa-check-circle');
        } else {
            updateTestStatus('error', `连接测试失败: ${result.error}`, 'fas fa-times-circle');
        }
        
    } catch (error) {
        console.error('测试连接失败:', error);
        updateTestStatus('error', `测试失败: ${error.message}`, 'fas fa-times-circle');
    }
}

async function performConnectionTest(config) {
    const testPrompt = "Hi";
    
    const requestBody = {
        model: config[CONFIG_KEYS.MODEL_NAME],
        messages: [
            {
                role: "user",
                content: testPrompt
            }
        ],
        max_tokens: 10,
        temperature: 0
    };
    
    try {
        // 创建支持超时的 AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), (config[CONFIG_KEYS.TIMEOUT] || 30) * 1000);
        
        try {
            const response = await fetch(config[CONFIG_KEYS.API_URL], {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config[CONFIG_KEYS.API_KEY]}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}${errorText ? ' - ' + errorText : ''}`
            };
        }
        
        const result = await response.json();
        
        // 检查响应格式
        if (!result.choices || !Array.isArray(result.choices) || result.choices.length === 0) {
            return {
                success: false,
                error: 'API响应格式不正确'
            };
        }
        
            return {
                success: true,
                data: result
            };
            
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                return {
                    success: false,
                    error: '连接超时'
                };
            }
            
            return {
                success: false,
                error: error.message || '未知错误'
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message || '网络错误'
        };
    }
}

function updateConnectionStatus(status, message) {
    elements.connectionStatus.style.display = 'flex';
    elements.statusText.textContent = message;
    
    // 更新状态样式
    elements.connectionStatus.className = `connection-status ${status}`;
    
    // 3秒后自动隐藏（除非是错误状态）
    if (status !== 'disconnected') {
        setTimeout(() => {
            if (elements.connectionStatus.className.includes(status)) {
                elements.connectionStatus.style.display = 'none';
            }
        }, 3000);
    }
}

function updateTestStatus(status, message, iconClass) {
    elements.testStatus.className = `test-status ${status}`;
    elements.testStatus.innerHTML = `
        <i class="${iconClass}"></i>
        <span>${message}</span>
    `;
    
    // 为测试结果容器添加相应的状态类
    elements.testResult.className = `test-result ${status}`;
}

function showConfigPrompt(show) {
    elements.configPrompt.style.display = show ? 'block' : 'none';
    
    // 如果显示提示，禁用分析功能
    if (show) {
        elements.startAnalysis.disabled = true;
        elements.startAnalysis.style.opacity = '0.5';
        elements.startAnalysis.style.cursor = 'not-allowed';
    } else {
        elements.startAnalysis.disabled = false;
        elements.startAnalysis.style.opacity = '';
        elements.startAnalysis.style.cursor = '';
    }
}

// 分析功能
async function startAnalysis() {
    const username = elements.username.value.trim();
    if (!username) {
        showNotification('请输入要分析的用户名', 'warning');
        elements.username.focus();
        return;
    }
    
    // 检查配置
    const config = await chrome.storage.sync.get(Object.values(CONFIG_KEYS));
    if (!validateConfiguration(config)) {
        showNotification('请先完成AI配置', 'warning');
        openConfigModal();
        return;
    }
    
    isAnalyzing = true;
    analysisAborted = false;
    updateAnalysisUI(true);
    showProgressSection(true);
    
    // 滚动到进度区域
    setTimeout(() => {
        elements.progressSection.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }, 100);
    
    try {
        // 步骤1: 数据获取
        updateAnalysisStatus('正在获取对话记录...', '连接到 linux.do 服务器，获取用户发布的内容', 1);
        updateProgress('正在获取对话记录...', 0, 1, true);
        
        const userData = await fetchUserData(username);
        if (analysisAborted) return;
        
        updateAnalysisStatus('对话记录获取完成', `成功获取 ${userData.length} 条用户内容`, 1, true);
        updateProgress('对话记录获取完成', userData.length, userData.length, true);
        
        // 对话记录获取完成后，滚动到风险报告页面
        setTimeout(() => {
            elements.resultsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }, 500);
        
        // 重置批次状态
        currentBatch = 0;
        totalBatches = 0;
        batchResults = [];
        allUserData = [];
        
        allUserData = userData;
        totalBatches = Math.ceil(userData.length / BATCH_SIZE);
        
        updateAnalysisStatus('数据获取完成', `已获取 ${userData.length} 条用户内容，将分 ${totalBatches} 批进行分析`, 1, true);
        
        // 步骤2: 分批AI分析
        updateAnalysisStatus('开始分批AI分析...', `准备分 ${totalBatches} 轮进行分析`, 2);
        
        // 显示分批控制面板和结果区域，让用户可以看到分析进度和切换批次
        showBatchControls(true, true); // true表示分析进行中
        updateBatchProgressUI();
        showResultsSection(true); // 确保结果区域可见，用户可以切换批次
        
        // 在AI分析阶段显示AI流式响应
        isAIAnalyzing = true;
        showAIResponseDisplay(true);
        
        // 分批进行AI分析
        for (let batch = 0; batch < totalBatches; batch++) {
            if (analysisAborted) return;
            
            currentBatch = batch + 1;
            const startIdx = batch * BATCH_SIZE;
            const endIdx = Math.min(startIdx + BATCH_SIZE, userData.length);
            const batchData = userData.slice(startIdx, endIdx);
            
            updateAnalysisStatus(`正在进行第 ${currentBatch} 轮分析...`, `分析内容 ${startIdx + 1} - ${endIdx} 条 (共${batchData.length}条)`, 2);
            
            // 关键修复：确保每轮分析开始时AI流式响应都是激活状态
            isAIAnalyzing = true;
            showAIResponseDisplay(true);
            
            // 更新批次进度UI
            markBatchAsAnalyzing(currentBatch);
            
            // 自动切换到当前正在分析的轮次，确保用户看到AI流式分析过程
            await switchToBatch(currentBatch - 1); // currentBatch从1开始，索引从0开始
            
            // 短暂延迟确保UI切换完成
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
                const batchResult = await analyzeWithAI(batchData, config, currentBatch, totalBatches);
                if (analysisAborted) return;
                
                batchResults.push({
                    batchNumber: currentBatch,
                    totalItems: batchData.length,
                    startIndex: startIdx,
                    endIndex: endIdx,
                    result: batchResult,
                    status: 'completed'
                });
                
                // 标记当前批次完成
                markBatchAsCompleted(currentBatch, batchResult);
                
                // 在第一个批次完成后显示第一个批次的结果
                if (currentBatch === 1 && totalBatches === 1) {
                    // 单轮时直接显示结果，不显示轮次提醒
                    await generateRiskReport(batchResult, `${username}`);
                } else if (currentBatch === 1) {
                    // 多轮时显示第一个批次的结果
                    await generateRiskReport(batchResult, `${username} (第${currentBatch}轮)`);
                    showNotification(`第 ${currentBatch} 轮分析完成，可点击切换查看`, 'info');
                }
                
            } catch (error) {
                console.error(`第${currentBatch}轮分析失败:`, error);
                
                // 保存失败的批次信息
                batchResults.push({
                    batchNumber: currentBatch,
                    totalItems: batchData.length,
                    startIndex: startIdx,
                    endIndex: endIdx,
                    result: null,
                    error: error.message,
                    status: 'failed',
                    batchData: batchData,
                    config: config
                });
                
                // 标记当前批次失败
                markBatchAsFailed(currentBatch, error);
                
                // 继续下一个批次，不中断整个流程
                showNotification(`第 ${currentBatch} 轮分析失败，可稍后重试`, 'warning');
            }
            
            updateAnalysisStatus(`第 ${currentBatch} 轮分析完成`, `已完成 ${currentBatch}/${totalBatches} 轮次，可点击查看结果`, 2);
        }
        
        updateAnalysisStatus('AI分析完成', `所有 ${totalBatches} 轮分析已完成，可切换查看各轮结果`, 2, true);
        
        // 步骤3: 生成综合报告
        updateAnalysisStatus('正在生成综合报告...', '整理所有分析结果', 3);
        updateProgress('正在生成风险报告...', 0, 1);
        
        const combinedResult = await generateCombinedReport(batchResults, username);
        updateAnalysisStatus('分析完成', '综合风险报告已生成', 3, true);
        
        updateProgress('分析完成', 1, 1);
        
        // 确保默认显示综合报告
        setTimeout(() => {
            if (totalBatches > 1) {
                switchToBatch('summary');
            }
        }, 100);
        
        // AI分析完成，隐藏AI响应框，显示结果
        isAIAnalyzing = false;
        showAIResponseDisplay(false);
        
        // 清除中断控制器
        currentAbortController = null;
        
        // 显示批次控制和结果 - 分析完成状态
        showBatchControls(true, false); // false表示分析已完成
        showResultsSection(true);
        
        // 滚动到结果区域
        setTimeout(() => {
            elements.resultsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }, 500);
        
        // 只有多轮时才显示总体完成提醒，单轮时不显示以避免重复
        if (totalBatches > 1) {
            showNotification('所有轮次分析完成', 'success');
        } else {
            showNotification('风险分析完成', 'success');
        }
        
    } catch (error) {
        console.error('分析过程出错:', error);
        showNotification(`分析失败: ${error.message}`, 'error');
        resetAnalysisState();
    }
}

function stopAnalysis() {
    analysisAborted = true;
    
    // 中断AI流式响应
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    
    resetAnalysisState();
    showNotification('分析已停止', 'info');
}

function resetAnalysisState() {
    isAnalyzing = false;
    updateAnalysisUI(false);
    showProgressSection(false);
    showResultsSection(false);
    
    // 隐藏AI响应框并重置状态
    isAIAnalyzing = false;
    showAIResponseDisplay(false);
    
    // 重置分析状态
    updateAnalysisStatus('准备开始...', '请稍候', 0);
    updateProgress('准备开始...', 0, 0);
    
    // 重置批次状态
    currentBatch = 0;
    totalBatches = 0;
    batchResults = [];
    allUserData = [];
    combinedRiskLevel = null; // 重置综合风险等级
    showBatchControls(false);
    
    // 清理批次UI
    if (elements.batchTabs) {
        elements.batchTabs.innerHTML = '';
    }
    if (elements.batchSummary) {
        elements.batchSummary.innerHTML = '';
    }
    
    // 清除用户头像缓存
    window.currentUserAvatar = null;
}

// 数据获取
async function fetchUserData(username) {
    const userData = [];
    let offset = 0;
    const limit = 30; // linux.do 每页显示30条
    let hasMore = true;
    let userAvatarTemplate = null; // 存储用户头像模板
    
    while (hasMore && !analysisAborted) {
        try {
            // 使用实际已获取的数量显示进度，避免显示预估的错误总数
            updateProgress(`正在获取对话记录 (第${Math.floor(offset/limit) + 1}页)`, userData.length, userData.length + 1, true);
            
            const response = await fetchUserActionsPage(username, offset);
            const data = response.user_actions || [];
            
            if (data.length === 0) {
                hasMore = false;
                break;
            }
            
            // 获取用户头像模板（只在第一次时获取）
            if (!userAvatarTemplate && data.length > 0 && data[0].avatar_template) {
                userAvatarTemplate = data[0].avatar_template;
                // 构建完整的头像URL (64像素大小)
                const avatarUrl = `https://linux.do${userAvatarTemplate.replace('{size}', '64')}`;
                
                // 预加载头像以提高显示成功率
                preloadUserAvatar(avatarUrl, username);
            }
            
            // 提取评论内容，同时进行内容过滤
            data.forEach(action => {
                if (action.excerpt && action.excerpt.trim()) {
                    const content = action.excerpt.trim();
                    // 过滤无用内容
                    if (!isUselessContent(content)) {
                        userData.push({
                            content: content,
                            timestamp: action.created_at,
                            topic_title: action.title,
                            post_id: action.post_id,
                            avatar_template: action.avatar_template // 保存头像模板
                        });
                    }
                }
            });
            
            offset += limit;
            
            // 添加延迟避免请求过于频繁
            await sleep(200);
            
        } catch (error) {
            console.error('获取数据失败:', error);
            if (offset === 0) {
                throw new Error('无法获取用户数据，请检查用户名是否正确');
            }
            hasMore = false;
        }
    }
    
    if (userData.length === 0) {
        throw new Error('未找到用户发布的内容');
    }
    
    // 去重处理
    const uniqueData = removeDuplicateContent(userData);
    
    return uniqueData;
}

async function fetchUserActionsPage(username, offset) {
    try {
        // 标签页版本：需要找到linux.do标签页并在其中执行脚本
        const tabs = await chrome.tabs.query({ url: "https://linux.do/*" });
        
        if (!tabs || tabs.length === 0) {
            throw new Error('请先打开 linux.do 网站');
        }
        
        const targetTab = tabs[0]; // 使用第一个匹配的标签页

        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: fetchUserActionsInPage,
            args: [username, offset]
        });

        if (!results || !results[0] || !results[0].result) {
            throw new Error('获取数据失败：脚本执行无结果');
        }

        const result = results[0].result;
        if (result.error) {
            throw new Error(result.error);
        }

        return result.data;
    } catch (error) {
        console.error('fetchUserActionsPage error:', error);
        if (error.message && error.message.includes('Cannot access')) {
            throw new Error('无法访问页面，请确保在linux.do网站上并刷新页面');
        }
        throw error;
    }
}

// 在页面中执行的函数
function fetchUserActionsInPage(username, offset) {
    return new Promise((resolve) => {
        const url = `/user_actions.json?offset=${offset}&username=${username}&filter=4,5`;
        
        fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            resolve({ data });
        })
        .catch(error => {
            resolve({ error: error.message });
        });
    });
}

// AI分析 - 支持流式响应和批次分析
// 带重试机制的AI分析函数
async function analyzeWithAI(userData, config, batchNumber = 1, totalBatches = 1) {
    const maxRetries = 3;
    const retryDelays = [2000, 5000, 10000]; // 2秒、5秒、10秒
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await performAIAnalysis(userData, config, batchNumber, totalBatches);
        } catch (error) {
 
            
            // 如果是429错误且不是最后一次尝试，则等待后重试
            if (error.message.includes('429') && attempt < maxRetries - 1) {
                const delay = retryDelays[attempt];
                showNotification(`第${batchNumber}轮分析遇到限制，${delay/1000}秒后自动重试 (${attempt + 1}/${maxRetries})`, 'warning');
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // 如果是其他错误或达到最大重试次数，抛出错误
            if (attempt === maxRetries - 1) {
                throw error;
            }
        }
    }
}

// 实际执行AI分析的函数
async function performAIAnalysis(userData, config, batchNumber = 1, totalBatches = 1) {
    // 设置全局变量供parseAIAnalysisResult使用
    window.currentBatchData = userData;
    window.allUserData = allUserData;
    
    const prompt = createAnalysisPrompt(userData, batchNumber, totalBatches);
    
    const requestBody = {
        model: config[CONFIG_KEYS.MODEL_NAME],
        messages: [
            {
                role: "system",
                content: "你是专业的个人隐私安全分析师。专注于识别社交媒体内容中的个人信息泄露风险，包括联系方式、身份信息、地址、财务信息等。分析要准确客观，建议要实用具体。必须严格按照JSON格式输出结果，禁止添加任何解释文字。非JSON格式是违规行为"
            },
            {
                role: "user", 
                content: prompt
            }
        ],
        temperature: 0.3,
        max_tokens: 50000,
        stream: true  // 启用流式响应
    };
    
    // 创建支持超时的 AbortController
    const controller = new AbortController();
    currentAbortController = controller; // 保存引用以便停止分析时中断
    const timeoutId = setTimeout(() => controller.abort(), config[CONFIG_KEYS.TIMEOUT] * 1000);
    
    try {
        const response = await fetch(config[CONFIG_KEYS.API_URL], {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config[CONFIG_KEYS.API_KEY]}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
    
        if (!response.ok) {
            // 特殊处理429错误（请求频率限制）
            if (response.status === 429) {
                throw new Error(`AI分析请求被限制 (429): 请求过于频繁，请稍后重试。建议等待几分钟后再次尝试。`);
            }
            // 处理其他HTTP错误
            else if (response.status === 401) {
                throw new Error(`AI分析请求失败 (401): API密钥无效，请检查配置。`);
            }
            else if (response.status === 403) {
                throw new Error(`AI分析请求失败 (403): 访问被拒绝，请检查API权限。`);
            }
            else if (response.status === 500) {
                throw new Error(`AI分析请求失败 (500): 服务器内部错误，请稍后重试。`);
            }
            else {
                throw new Error(`AI分析请求失败: ${response.status} ${response.statusText}`);
            }
        }
        
        // 处理流式响应
        return await processStreamResponse(response);
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('AI分析请求超时');
        }
        throw error;
    }
}

// 处理流式响应
async function processStreamResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            // 解码数据块
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // 按行分割数据
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留不完整的行
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (trimmedLine === '') continue;
                if (trimmedLine === 'data: [DONE]') continue;
                
                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const jsonStr = trimmedLine.substring(6);
                        const data = JSON.parse(jsonStr);
                        
                        // 提取内容
                        if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                            const content = data.choices[0].delta.content;
                            fullContent += content;
                            
                            // 实时更新分析状态
                            updateStreamingAnalysisStatus(fullContent);
                        }
                    } catch (e) {
                        console.warn('解析流数据失败:', e, trimmedLine);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
    
    if (!fullContent.trim()) {
        throw new Error('AI返回内容为空');
    }
    
    return parseAIAnalysisResult(fullContent);
}

// 获取AI响应滚动容器的辅助函数
function getResponseContainer() {
    if (!elements.responseContent && elements.aiResponseDisplay) {
        elements.responseContent = elements.aiResponseDisplay.querySelector('.response-content');
    }
    return elements.responseContent;
}

// AI响应显示功能
function showAIResponseDisplay(show, resetContent = true) {
    elements.aiResponseDisplay.style.display = show ? 'block' : 'none';
    // 当显示AI响应时隐藏报告内容，反之亦然
    elements.reportContent.style.display = show ? 'none' : 'block';
    
    if (show && resetContent) {
        // 只在需要重置内容时才初始化
        elements.aiResponseText.innerHTML = formatAIResponseContent('正在连接AI服务，准备开始分析...');
        updateResponseStats(0, '连接中');
        
        // 初始化时将滚动容器滚动到顶部
        const container = getResponseContainer();
        if (container) {
            container.scrollTop = 0;
        }
    } else if (show && !resetContent) {
        // 如果不重置内容，只是确保显示状态正确
        const container = getResponseContainer();
        if (container) {
            // 滚动到底部以显示最新内容
            container.scrollTop = container.scrollHeight;
        }
    }
}

function updateAIResponseDisplay(content, charCount, status) {
    if (!elements.aiResponseDisplay || elements.aiResponseDisplay.style.display === 'none') {
        return;
    }
    
    // 更新响应文本 - 使用格式化后的HTML
    const formattedContent = formatAIResponseContent(content || '正在等待AI响应...');
    elements.aiResponseText.innerHTML = formattedContent;
    
    // 更新统计信息
    updateResponseStats(charCount, status || '分析中');
    
    // AI响应框内部自动滚动到底部（显示最新内容）
    requestAnimationFrame(() => {
        const container = getResponseContainer();
        if (container) {
            // 滚动到底部显示最新的AI分析内容
            container.scrollTop = container.scrollHeight;
        }
    });
}

function updateResponseStats(charCount, status) {
    if (elements.charCount) {
        elements.charCount.textContent = `已接收 ${charCount} 个字符`;
    }
    
    if (elements.statusText) {
        elements.statusText.textContent = status;
    }
}

// 更新流式分析状态
function updateStreamingAnalysisStatus(content) {
    const contentLength = content.length;
    
    // 更新AI响应显示框
    updateAIResponseDisplay(content, contentLength, '正在接收AI分析数据');
    
    // 更新状态文本 - 只在AI分析阶段显示，不覆盖数据获取阶段的状态
    if (isAIAnalyzing) {
        updateAnalysisStatus('正在接收AI分析结果...', `已接收 ${contentLength} 个字符`, 2);
    }
}

// 格式化AI响应内容 - 纯文本显示
function formatAIResponseContent(content) {
    if (!content) return '';
    
    // 只进行基本的HTML转义和换行处理
    let formatted = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    
    return formatted;
}

function createAnalysisPrompt(userData, batchNumber = 1, totalBatches = 1) {
    const contents = userData.map(item => item.content).join('\n---\n');
    const totalPosts = userData.length;
    
    const batchInfo = totalBatches > 1 ? `

**批次信息**: 第 ${batchNumber}/${totalBatches} 批，本批 ${totalPosts} 条内容` : '';
    
    return `# 隐私风险分析专家任务${batchInfo}

你是专业的个人信息安全分析师。请对以下 ${totalPosts} 条社交媒体内容进行整体性隐私风险分析。并采用中文回复。

**重要：请采用整体分析模式，不要逐条分析每一条内容。应该从全局视角识别隐私泄露模式和风险点。**

## 分析内容
${contents}

## 分析方法要求
1. **整体扫描**: 扫描所有内容，识别关键风险信息
2. **模式识别**: 寻找跨内容的信息泄露模式
3. **风险聚合**: 将相似风险归类整合，避免重复报告
4. **重点突出**: 只报告真正重要的隐私风险点

## 核心检测目标（优先级排序）

### 🔴 极高风险（必查）
- 邮箱地址、手机号码、QQ/微信等通讯账号
- 真实姓名、身份证号、证件信息
- 家庭住址、工作地址、具体位置信息
- 银行账户、支付信息、财务状况

### 🟡 中高风险
- 工作单位、职位、同事姓名
- 学校名称、专业、班级信息
- 家庭成员姓名、亲友关系
- 健康状况、疾病信息、就医记录

### 🟢 中低风险
- 详细兴趣爱好、消费习惯
- 行为模式、作息时间
- 使用的软硬件、设备型号

## 评分标准
- **高风险(70-100分)**: 包含可直接用于身份冒用或诈骗的核心信息
- **中风险(40-69分)**: 包含重要个人信息，组合使用可能造成隐私泄露
- **低风险(0-39分)**: 信息相对安全，隐私泄露风险较低

## 输出要求
**必须严格按照以下JSON格式输出，禁止添加任何解释文字或markdown标记：**

{
  "riskLevel": "low|medium|high",
  "riskScore": 数字0-100,
  "summary": "整体风险总结(100字内，突出主要风险类型和严重程度)",
  "detectedRisks": [
    {
      "type": "风险类型名称",
      "content": "发现的敏感信息概要(已脱敏)",
      "severity": "low|medium|high", 
      "description": "该类型风险的影响说明",
      "recommendation": "针对性防护建议"
    }
  ],
  "recommendations": [
    "基于发现风险的具体防护建议",
    "实用可执行的隐私保护措施"
  ],
  "analysisMetadata": {
    "totalContentAnalyzed": ${totalPosts},
    "analysisTimestamp": "${new Date().toISOString()}",
    "confidenceLevel": "high|medium|low"
  }
}

**关键要求：**
1. 严格遵循JSON格式，不能有语法错误
2. 采用整体分析，不逐条分析
3. 只报告真正发现的风险，没有就是低风险
4. 建议要具体实用，避免空洞表述
5. 风险内容要适度脱敏保护隐私`;
}

function parseAIAnalysisResult(aiResponse) {
    try {
        
        // 更精确的JSON提取方法
        let jsonString = extractValidJSON(aiResponse);
        
        if (!jsonString) {
            throw new Error('未找到有效的JSON格式内容');
        }
        
        
        // 尝试解析JSON
        let result;
        try {
            result = JSON.parse(jsonString);
        } catch (parseError) {
            
            // 尝试修复常见的JSON错误
            const fixedJson = fixJSONErrors(jsonString);
            
            result = JSON.parse(fixedJson);
        }
        
        // 验证和补充必要字段
        result = validateAndFixResult(result);
        
        return result;
        
    } catch (error) {
        console.error('解析AI结果失败:', error);
        console.error('错误堆栈:', error.stack);
        console.error('错误的AI响应内容长度:', aiResponse.length);
        console.error('错误的AI响应内容预览:', aiResponse.substring(0, 500) + '...');
        
        // 返回包含详细错误信息的默认结果
        return createErrorResult(error, aiResponse);
    }
}

// 提取有效的JSON内容 - 增强版
function extractValidJSON(response) {
    
    // 第一步：多种清理策略
    let cleaned = response;
    
    // 策略1：移除markdown标记
    cleaned = cleaned.replace(/```json\s*/gi, '');
    cleaned = cleaned.replace(/```\s*$/g, '');
    cleaned = cleaned.replace(/^[\s\n]*/, ''); // 移除开头的空白符
    
    // 策略2：查找JSON开始位置
    const jsonStartPatterns = [
        /^\s*{/,  // 直接以{开始
        /^[^{]*({)/  // 在某个位置找到第一个{
    ];
    
    let startPos = 0;
    for (const pattern of jsonStartPatterns) {
        const match = cleaned.match(pattern);
        if (match) {
            startPos = match.index + (match[1] ? match.index + match[0].indexOf('{') : 0);
            break;
        }
    }
    
    if (startPos > 0) {
        cleaned = cleaned.substring(startPos);
    }
    
    cleaned = cleaned.trim();
    
    // 验证是否以{开始
    if (!cleaned.startsWith('{')) {
        console.error('清理后的内容不以{开始，尝试修复...');
        // 尝试在内容中查找第一个完整的{
        const firstBraceIndex = cleaned.indexOf('{');
        if (firstBraceIndex !== -1) {
            cleaned = cleaned.substring(firstBraceIndex);
        } else {
            return null;
        }
    }
    
    // 改进的大括号匹配算法
    const extractedJson = findCompleteJSONObject(cleaned);
    
    if (extractedJson) {
        
        // 最后验证：尝试快速解析检查
        try {
            JSON.parse(extractedJson);
            return extractedJson;
        } catch (e) {
            console.warn('提取的JSON格式验证失败，尝试修复:', e.message);
            // 尝试修复常见问题
            const fixed = attemptJSONRepair(extractedJson);
            if (fixed) {
                return fixed;
            }
        }
    }
    
    console.error('无法提取有效的JSON对象');
    return null;
}

// 查找完整的JSON对象
function findCompleteJSONObject(text) {
    let braceCount = 0;
    let inString = false;
    let inEscape = false;
    let startFound = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (inEscape) {
            inEscape = false;
            continue;
        }
        
        if (char === '\\' && inString) {
            inEscape = true;
            continue;
        }
        
        if (char === '"') {
            inString = !inString;
            continue;
        }
        
        if (!inString) {
            if (char === '{') {
                braceCount++;
                startFound = true;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && startFound) {
                    // 找到完整的JSON对象
                    return text.substring(0, i + 1);
                }
            }
        }
    }
    
    // 如果没有找到完整的对象，但有开始，可能是被截断了
    if (startFound && braceCount > 0) {
        console.warn('JSON可能被截断，缺少', braceCount, '个右括号');
        // 尝试补全
        let completed = text + '}}'.repeat(braceCount);
        try {
            JSON.parse(completed);
            return completed;
        } catch (e) {
            console.error('补全JSON失败:', e.message);
        }
    }
    
    return null;
}

// 尝试修复JSON错误
function attemptJSONRepair(jsonString) {
    
    let repaired = jsonString;
    
    try {
        // 修复1: 移除末尾的多余内容
        const lastBraceIndex = repaired.lastIndexOf('}');
        if (lastBraceIndex !== -1 && lastBraceIndex < repaired.length - 1) {
            repaired = repaired.substring(0, lastBraceIndex + 1);
        }
        
        // 修复2: 修复常见的引号问题
        repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        
        // 修复3: 移除末尾多余的逗号
        repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
        
        // 修复4: 确保字符串值有引号
        repaired = repaired.replace(/:\s*([^",\{\}\[\]]+)(\s*[,\}])/g, function(match, value, ending) {
            const trimmed = value.trim();
            if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || /^\d+(\.\d+)?$/.test(trimmed)) {
                return ':' + trimmed + ending;
            }
            return ':"' + trimmed + '"' + ending;
        });
        
        // 验证修复结果
        JSON.parse(repaired);
        return repaired;
        
    } catch (e) {
        console.error('JSON修复失败:', e.message);
        return null;
    }
}


// 验证和修复结果对象
function validateAndFixResult(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('解析结果不是有效的对象');
    }
    
    // 补充必要字段
    result.riskLevel = result.riskLevel || 'medium';
    result.riskScore = typeof result.riskScore === 'number' ? result.riskScore : 50;
    result.summary = result.summary || '分析完成，但缺少详细摘要';
    result.detectedRisks = Array.isArray(result.detectedRisks) ? result.detectedRisks : [];
    result.recommendations = Array.isArray(result.recommendations) ? result.recommendations : ['建议加强隐私保护意识'];
    
    if (!result.analysisMetadata || typeof result.analysisMetadata !== 'object') {
        result.analysisMetadata = {
            totalContentAnalyzed: 0,
            analysisTimestamp: new Date().toISOString(),
            confidenceLevel: 'medium'
        };
    }
    
    // 设置分析内容数量
    if (!result.analysisMetadata.totalContentAnalyzed || result.analysisMetadata.totalContentAnalyzed === 0) {
        if (window.currentBatchData && window.currentBatchData.length > 0) {
            result.analysisMetadata.totalContentAnalyzed = window.currentBatchData.length;
        } else if (window.allUserData && window.allUserData.length > 0) {
            result.analysisMetadata.totalContentAnalyzed = window.allUserData.length;
        }
    }
    
    return result;
}

// 创建错误结果
function createErrorResult(error, aiResponse) {
    const errorDetails = {
        message: error.message,
        name: error.name,
        position: error.message.match(/position (\d+)/) ? error.message.match(/position (\d+)/)[1] : 'unknown'
    };
    
    return {
        riskLevel: 'medium',
        riskScore: 50,
        summary: `AI分析结果解析失败: ${error.message}`,
        detectedRisks: [
            {
                type: '解析错误',
                content: 'AI返回结果无法正确解析',
                severity: 'medium',
                description: `错误详情: ${error.message}。错误位置: ${errorDetails.position}。可能的原因：AI返回格式不符合要求，JSON语法错误，或包含未转义的特殊字符。`,
                recommendation: '请检查AI配置，确保模型支持严格的JSON格式输出，或联系技术支持'
            }
        ],
        recommendations: [
            '重新配置AI参数，要求严格的JSON格式输出',
            '检查网络连接稳定性，避免传输中断',
            '尝试减少单次分析的内容量',
            '更新prompt模板，强调JSON格式要求',
            '联系技术支持并提供完整的错误日志'
        ],
        analysisMetadata: {
            totalContentAnalyzed: 0,
            analysisTimestamp: new Date().toISOString(),
            confidenceLevel: 'low',
            errorInfo: {
                ...errorDetails,
                responseLength: aiResponse.length,
                responsePreview: aiResponse.substring(0, 200) + '...'
            }
        }
    };
}


// 报告生成
async function generateRiskReport(analysisResult, username) {
    // 确保显示报告内容，隐藏AI响应框
    showAIResponseDisplay(false);
    
    // 生成风险总览
    const summaryHtml = createRiskSummaryHtml(analysisResult, username);
    elements.riskSummary.innerHTML = summaryHtml;
    
    // 生成详细风险信息
    const detailsHtml = createRiskDetailsHtml(analysisResult.detectedRisks || []);
    elements.riskDetails.innerHTML = detailsHtml;
    
    // 生成安全建议
    const recommendationsHtml = createRecommendationsHtml(analysisResult.recommendations || []);
    elements.recommendations.innerHTML = recommendationsHtml;
    
    // 如果是全部失败的情况，添加重新分析所有批次按钮的事件监听器
    if (analysisResult.analysisMetadata?.successfulBatches === 0) {
        setTimeout(() => {
            const retryAllBtn = document.getElementById('retry-all-batches-btn');
            if (retryAllBtn) {
                retryAllBtn.addEventListener('click', async () => {
                    
                    // 清空当前结果
                    batchResults.length = 0;
                    
                    // 重新开始分析流程
                    try {
                        retryAllBtn.disabled = true;
                        retryAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 重新分析中...';
                        showNotification('开始重新分析所有批次...', 'info');
                        
                        // 重新开始整个分析流程
                        await performAnalysis();
                    } catch (error) {
                        console.error('重新分析失败:', error);
                        showNotification(`重新分析失败: ${error.message}`, 'error');
                        retryAllBtn.disabled = false;
                        retryAllBtn.innerHTML = '<i class="fas fa-refresh"></i> 重新分析所有批次';
                    }
                });
            }
        }, 100);
    }
}

function createRiskSummaryHtml(result, username) {
    const riskLevel = result.riskLevel || 'medium';
    const riskScore = result.riskScore || 50;
    const summary = result.summary || '分析完成，未发现明显风险';
    const totalAnalyzed = result.analysisMetadata?.totalContentAnalyzed || 0;
    const analysisTime = result.analysisMetadata?.analysisTimestamp || new Date().toISOString();
    const confidenceLevel = result.analysisMetadata?.confidenceLevel || 'medium';
    
    // 格式化时间显示
    const timeFormatted = new Date(analysisTime).toLocaleString('zh-CN');
    
    // 生成用户头像或默认图标 - 符合CSP安全策略
    const userAvatar = window.currentUserAvatar;
    const avatarHtml = userAvatar ? 
        `<div class="avatar-container">
            <img src="${userAvatar}" 
                 alt="${username}" 
                 class="user-avatar risk-avatar-img" 
                 loading="lazy"
                 data-username="${username}">
            <i class="fas fa-user-circle risk-avatar-fallback" style="display: none;"></i>
        </div>` :
        `<i class="fas fa-user-circle"></i>`;
    
    return `
        <div class="risk-level">
            <div class="risk-level-info">
                <div class="risk-level-icon ${riskLevel}">
                    ${avatarHtml}
                </div>
                <div class="risk-level-text">
                    <div class="risk-level-title">${username} 的隐私风险评估</div>
                    <div class="risk-level-subtitle">
                        分析了 <strong>${totalAnalyzed}</strong> 条内容 | 
                        分析时间：${timeFormatted} | 
                        置信度：${getConfidenceLevelText(confidenceLevel)}
                    </div>
                </div>
            </div>
            <div class="risk-badge ${riskLevel}">${getRiskLevelText(riskLevel)}</div>
        </div>
        
        <div class="risk-score-container">
            <div class="risk-score-title">综合风险评分</div>
            <div class="risk-score-display">
                <div class="risk-score-number ${riskLevel}">${riskScore}</div>
                <span style="font-size: 18px; color: #6b7280;">/100</span>
            </div>
            <div class="risk-score-bar">
                <div class="risk-score-fill ${riskLevel}" style="width: ${Math.max(riskScore, 5)}%;"></div>
            </div>
            <div class="risk-score-description">
                ${getRiskScoreDescription(riskScore, riskLevel)}
            </div>
        </div>
        
        <div class="risk-summary-text">
            <div class="summary-header">
                <i class="fas fa-clipboard-check"></i>
                <span>分析总结</span>
            </div>
            <div class="summary-content">
                ${summary}
            </div>
            ${result.analysisMetadata?.successfulBatches === 0 ? `
            <div class="retry-all-section" style="margin-top: 15px; padding: 12px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                    <strong>所有批次分析失败</strong>
                </div>
                <p style="margin: 4px 0; color: #92400e; font-size: 14px;">建议检查配置后重新分析所有批次</p>
                <button class="btn btn-warning" id="retry-all-batches-btn" style="margin-top: 8px;">
                    <i class="fas fa-refresh"></i>
                    重新分析所有批次
                </button>
            </div>
            ` : ''}
        </div>
    `;
}

function createRiskDetailsHtml(risks) {
    if (!risks || risks.length === 0) {
        return `
            <div class="risk-details-header">
                <i class="fas fa-check-circle" style="color: #10b981;"></i>
                <h3>风险详情</h3>
            </div>
            <div style="text-align: center; color: #10b981; padding: 40px 20px; background: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0;">
                <i class="fas fa-shield-alt" style="font-size: 48px; margin-bottom: 16px; opacity: 0.7;"></i>
                <p style="font-size: 18px; font-weight: 600; margin: 0;">安全状态良好</p>
                <p style="font-size: 14px; margin: 8px 0 0 0; opacity: 0.8;">未发现明显的个人信息泄露风险</p>
            </div>
        `;
    }
    
    const header = `
        <div class="risk-details-header">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>发现的风险项目</h3>
        </div>
    `;
    
    const items = risks.map(risk => `
        <div class="risk-item">
            <div class="risk-item-header">
                <div class="risk-item-info">
                    <div class="risk-item-icon ${risk.severity}">
                        <i class="fas ${getRiskIcon(risk.type)}"></i>
                    </div>
                    <div>
                        <div class="risk-item-title">${risk.type}</div>
                        <div class="risk-item-severity">${getRiskLevelText(risk.severity)} 风险</div>
                    </div>
                </div>
                <div class="risk-badge ${risk.severity}">${getRiskLevelText(risk.severity)}</div>
            </div>
            <div class="risk-item-content">
                <p><strong>发现内容：</strong>${risk.content}</p>
                <p><strong>风险说明：</strong>${risk.description}</p>
                ${risk.recommendation ? `<p><strong>防护建议：</strong>${risk.recommendation}</p>` : ''}
            </div>
        </div>
    `).join('');
    
    return header + items;
}

function createRecommendationsHtml(recommendations) {
    if (!recommendations || recommendations.length === 0) {
        return `
            <h4><i class="fas fa-lightbulb"></i> 安全建议</h4>
            <div style="text-align: center; padding: 20px; color: #065f46;">
                <p style="margin: 0;">暂无特殊建议，请继续保持良好的隐私保护习惯。</p>
            </div>
        `;
    }
    
    const recommendationsList = recommendations.map(rec => `<li>${rec}</li>`).join('');
    
    return `
        <h4><i class="fas fa-lightbulb"></i> 专业安全建议</h4>
        <ul class="recommendations-list">${recommendationsList}</ul>
    `;
}


// UI更新函数
function updateAnalysisUI(analyzing) {
    elements.startAnalysis.style.display = analyzing ? 'none' : 'inline-flex';
    elements.stopAnalysis.style.display = analyzing ? 'inline-flex' : 'none';
    elements.username.disabled = analyzing;
}

function showProgressSection(show) {
    elements.progressSection.style.display = show ? 'block' : 'none';
    if (!show) {
        elements.resultsSection.style.display = 'none';
    }
}

function showResultsSection(show) {
    elements.resultsSection.style.display = show ? 'block' : 'none';
    if (show) {
        // 如果正在分析中，不隐藏进度区域，让用户可以看到AI流式分析过程
        if (!isAnalyzing) {
            elements.progressSection.style.display = 'none';
        }
    }
}

function updateProgress(text, current, total, showAsGreenPill = false) {
    if (showAsGreenPill) {
        // 使用绿色胶囊样式包装进度文字和数字，在数字前加横线分隔符
        if (elements.progressText) {
            elements.progressText.innerHTML = `<span class="progress-status-pill">${text} - ${current} 条</span>`;
        }
    } else {
        // 正常的进度条显示，也使用胶囊样式包装状态文字
        if (elements.progressText) {
            elements.progressText.innerHTML = `<span class="progress-status-pill">${text}</span>`;
        }
        if (elements.progressCount) {
            elements.progressCount.textContent = `${current} / ${total}`;
        }
        
        const percentage = total > 0 ? (current / total) * 100 : 0;
        if (elements.progressFill) {
            elements.progressFill.style.width = `${percentage}%`;
        }
    }
}

function updateAnalysisStatus(mainText, subText, step, completed = false) {
    if (elements.analysisStatus) {
        elements.analysisStatus.textContent = mainText;
    }
    if (elements.analysisSubstatus) {
        elements.analysisSubstatus.textContent = subText;
    }
    
    // 更新步骤指示器
    for (let i = 1; i <= 3; i++) {
        const stepElement = elements[`step${i}`];
        if (stepElement) {
            stepElement.className = 'status-step';
            if (i < step || (i === step && completed)) {
                stepElement.classList.add('completed');
            } else if (i === step && !completed) {
                stepElement.classList.add('active');
            }
        }
    }
}

// 导出功能 - 优化的打印实现
function exportReport() {
    try {
        // 检查是否有分析结果
        if (!elements.riskSummary.innerHTML || elements.riskSummary.innerHTML.trim() === '') {
            showNotification('暂无分析结果可导出', 'warning');
            return;
        }
        
        // 立即显示通知
        showNotification('正在准备打印预览... 📄', 'info');
        
        // 使用更可靠的打印方法
        setTimeout(() => {
            setupPrintableContent();
            
            // 延迟执行打印，确保样式已生效
            setTimeout(() => {
                window.print();
                
                // 设置清理函数
                setupPrintCleanup();
            }, 100);
        }, 50);
        
    } catch (error) {
        console.error('报告导出失败:', error);
        showNotification(`报告导出失败: ${error.message}`, 'error');
        
        // 降级到JSON导出
        exportReportAsJSON();
    }
}

// 设置可打印内容
function setupPrintableContent() {
    // 清理之前的打印内容
    cleanupPrintContent();
    
    // 添加打印样式
    addEnhancedPrintStyles();
    
    // 标记页面内容为可打印
    markPageContentPrintable();
}

// 设置打印清理
function setupPrintCleanup() {
    const printCleanup = () => {
        cleanupPrintContent();
        // 移除事件监听器
        window.removeEventListener('afterprint', printCleanup);
        window.removeEventListener('focus', delayedCleanup);
    };
    
    const delayedCleanup = () => {
        setTimeout(printCleanup, 1000); // 延迟清理，确保打印对话框已关闭
    };
    
    // 监听打印完成事件
    window.addEventListener('afterprint', printCleanup);
    
    // 备用清理 - 监听窗口重新获取焦点
    setTimeout(() => {
        window.addEventListener('focus', delayedCleanup);
    }, 500);
    
    // 最后的安全网，强制清理
    setTimeout(printCleanup, 30000);
}

// 清理打印相关内容
function cleanupPrintContent() {
    // 移除打印样式
    const printStyle = document.getElementById('enhanced-print-styles');
    if (printStyle) {
        printStyle.remove();
    }
    
    // 恢复页面元素的打印类
    document.body.classList.remove('print-mode');
    
    // 移除打印容器
    const printContainer = document.querySelector('.print-only-container');
    if (printContainer) {
        printContainer.remove();
    }
}

// 添加增强的打印样式
function addEnhancedPrintStyles() {
    const printStyleId = 'enhanced-print-styles';
    
    // 移除已存在的样式
    const existingStyle = document.getElementById(printStyleId);
    if (existingStyle) {
        existingStyle.remove();
    }
    
    const printStyle = document.createElement('style');
    printStyle.id = printStyleId;
    printStyle.textContent = `
        @media print {
            /* 页面设置 */
            @page {
                margin: 1.5cm;
                size: A4;
            }
            
            /* 基础重置 */
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                box-sizing: border-box !important;
            }
            
            /* 隐藏不需要打印的元素 */
            body.print-mode .navigation,
            body.print-mode .sidebar,
            body.print-mode .progress-section,
            body.print-mode .control-panel,
            body.print-mode .ai-response-display,
            body.print-mode .export-btn,
            body.print-mode .btn-icon,
            body.print-mode .no-print,
            body.print-mode .start-analysis,
            body.print-mode .stop-analysis {
                display: none !important;
            }
            
            /* 只显示打印容器 */
            body.print-mode .print-only-container {
                display: block !important;
                position: static !important;
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
                background: white !important;
                color: black !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
                font-size: 12px !important;
                line-height: 1.4 !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            
            /* 打印标题 */
            .print-header {
                text-align: center;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #333;
                page-break-after: avoid;
            }
            
            .print-header h1 {
                font-size: 24px !important;
                color: #2563eb !important;
                margin: 0 0 10px 0 !important;
                font-weight: bold !important;
            }
            
            .print-header h2 {
                font-size: 16px !important;
                color: #666 !important;
                margin: 0 !important;
                font-weight: normal !important;
            }
            
            /* 元数据信息 */
            .print-meta {
                text-align: center;
                margin-bottom: 30px;
                font-size: 11px;
                color: #666;
                page-break-after: avoid;
            }
            
            /* 报告内容区域 */
            .print-risk-summary,
            .print-risk-details,
            .print-recommendations {
                background: white !important;
                border: 1px solid #ddd !important;
                margin-bottom: 20px !important;
                padding: 15px !important;
                page-break-inside: avoid;
                border-radius: 8px !important;
            }
            
            /* 风险项目 */
            .print-risk-item {
                page-break-inside: avoid;
                margin-bottom: 15px !important;
                padding: 10px !important;
                border: 1px solid #eee !important;
                border-radius: 4px !important;
            }
            
            /* 标题样式 */
            .print-content h3, .print-content h4 {
                color: #2563eb !important;
                margin: 0 0 10px 0 !important;
                font-weight: bold !important;
                page-break-after: avoid;
            }
            
            .print-content h3 {
                font-size: 16px !important;
            }
            
            .print-content h4 {
                font-size: 14px !important;
            }
            
            /* 文本内容 */
            .print-content p, .print-content li {
                margin: 5px 0 !important;
                color: #333 !important;
                font-size: 12px !important;
                line-height: 1.4 !important;
            }
            
            .print-content ul, .print-content ol {
                margin: 10px 0 !important;
                padding-left: 20px !important;
            }
            
            /* 批次信息 */
            .print-batch-info {
                background: #f0f9ff !important;
                border: 1px solid #bfdbfe !important;
                padding: 15px !important;
                margin-bottom: 20px !important;
                border-radius: 8px !important;
                text-align: center !important;
                page-break-inside: avoid;
            }
            
            /* 页脚 */
            .print-footer {
                margin-top: 30px;
                text-align: center;
                font-size: 10px;
                color: #666;
                border-top: 1px solid #ddd;
                padding-top: 15px;
                page-break-inside: avoid;
            }
            
            /* 确保其他内容隐藏 */
            body.print-mode > *:not(.print-only-container) {
                display: none !important;
            }
        }
        
        /* 默认隐藏打印容器 */
        .print-only-container {
            display: none;
        }
    `;
    
    document.head.appendChild(printStyle);
}

// 标记页面内容为可打印状态
function markPageContentPrintable() {
    // 为body添加打印模式类
    document.body.classList.add('print-mode');
    
    // 创建专用的打印容器
    const printContainer = document.createElement('div');
    printContainer.className = 'print-only-container';
    
    const username = elements.username.value || '未知用户';
    const timestamp = new Date().toLocaleString('zh-CN');
    
    // 获取当前显示的内容
    const riskSummaryContent = convertToPrintableContent(elements.riskSummary.innerHTML);
    const riskDetailsContent = convertToPrintableContent(elements.riskDetails.innerHTML);
    const recommendationsContent = convertToPrintableContent(elements.recommendations.innerHTML);
    
    // 批次信息
    let batchInfo = '';
    if (typeof batchResults !== 'undefined' && batchResults.length > 1) {
        const totalItems = batchResults.reduce((sum, batch) => sum + batch.totalItems, 0);
        batchInfo = `
            <div class="print-batch-info">
                <p><strong>分批分析信息：</strong>共进行了 ${batchResults.length} 轮分析，总计 ${totalItems} 条内容</p>
            </div>
        `;
    }
    
    printContainer.innerHTML = `
        <div class="print-content">
            <div class="print-header">
                <h1>🛡️ RiskLens 风险透镜</h1>
                <h2>个人信息泄露风险分析报告</h2>
            </div>
            
            <div class="print-meta">
                <p><strong>分析用户：</strong>${username} | <strong>报告生成时间：</strong>${timestamp}</p>
            </div>
            
            ${batchInfo}
            
            <div class="print-risk-summary">
                <h3>风险总览</h3>
                ${riskSummaryContent}
            </div>
            
            <div class="print-risk-details">
                <h3>风险详情</h3>
                ${riskDetailsContent}
            </div>
            
            <div class="print-recommendations">
                <h3>安全建议</h3>
                ${recommendationsContent}
            </div>
            
            <div class="print-footer">
                <p>本报告由 RiskLens 风险透镜生成 | 生成时间: ${timestamp}</p>
                <p>请妥善保管此报告，注意保护个人隐私信息</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(printContainer);
}

// 转换内容为适合打印的格式
function convertToPrintableContent(htmlContent) {
    if (!htmlContent) return '<p>暂无内容</p>';
    
    // 创建临时容器来处理HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // 移除不适合打印的元素
    const elementsToRemove = tempDiv.querySelectorAll('.btn-icon, .export-btn, .no-print, button, input');
    elementsToRemove.forEach(el => el.remove());
    
    // 转换图标为文字
    const icons = tempDiv.querySelectorAll('i.fas, i.far, i.fab');
    icons.forEach(icon => {
        const textNode = document.createTextNode('• ');
        icon.parentNode.replaceChild(textNode, icon);
    });
    
    // 简化样式
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach(el => {
        // 移除内联样式，让CSS控制
        el.removeAttribute('style');
        
        // 添加打印专用类
        if (el.classList.contains('risk-item')) {
            el.classList.add('print-risk-item');
        }
    });
    
    return tempDiv.innerHTML;
}


// 创建可打印的报告内容
function createPrintableReport() {
    const username = elements.username.value || '未知用户';
    const timestamp = new Date().toLocaleString('zh-CN');
    
    // 获取报告内容
    const summaryContent = elements.riskSummary.innerHTML || '';
    const detailsContent = elements.riskDetails.innerHTML || '';
    const recommendationsContent = elements.recommendations.innerHTML || '';
    
    // 批次信息
    let batchInfo = '';
    if (batchResults.length > 1) {
        const totalItems = batchResults.reduce((sum, batch) => sum + batch.totalItems, 0);
        batchInfo = `
            <div class="batch-summary">
                <p><strong>分批分析信息：</strong>共进行了 ${batchResults.length} 轮分析，总计 ${totalItems} 条内容</p>
            </div>
        `;
    }
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>RiskLens 风险透镜 - 分析报告</title>
        <style>
            @media print {
                @page { margin: 2cm; }
                body { -webkit-print-color-adjust: exact; }
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            
            .header {
                text-align: center;
                background: #2563eb;
                color: white;
                padding: 30px;
                border-radius: 12px;
                margin-bottom: 30px;
            }
            
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 700;
            }
            
            .header h2 {
                margin: 10px 0 0 0;
                font-size: 18px;
                font-weight: 400;
            }
            
            .meta-info {
                background: #f8fafc;
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
                margin-bottom: 30px;
            }
            
            .meta-info p {
                margin: 5px 0;
                font-size: 14px;
            }
            
            .section {
                margin-bottom: 30px;
                page-break-inside: avoid;
            }
            
            .section-title {
                font-size: 20px;
                font-weight: 600;
                color: #2563eb;
                margin-bottom: 15px;
                padding-bottom: 8px;
                border-bottom: 2px solid #e2e8f0;
            }
            
            .batch-summary {
                background: #f0f9ff;
                padding: 15px;
                border-radius: 8px;
                border: 1px solid #bfdbfe;
                margin-bottom: 20px;
            }
            
            .batch-summary p {
                margin: 0;
                color: #1e40af;
            }
            
            .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                text-align: center;
                color: #6b7280;
                font-size: 12px;
            }
            
            /* 继承原有的风险报告样式 */
            .risk-summary, .risk-details, .recommendations {
                background: white;
                padding: 20px;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                margin-bottom: 20px;
            }
            
            .risk-level {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }
            
            .risk-badge {
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
            }
            
            .risk-badge.low { background: #d1fae5; color: #065f46; }
            .risk-badge.medium { background: #fef3c7; color: #92400e; }
            .risk-badge.high { background: #fee2e2; color: #991b1b; }
            
            .risk-item {
                background: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 15px;
            }
            
            .recommendations ul {
                list-style: none;
                padding: 0;
            }
            
            .recommendations li {
                position: relative;
                padding: 8px 0 8px 30px;
                margin-bottom: 8px;
            }
            
            .recommendations li:before {
                content: "✓";
                position: absolute;
                left: 8px;
                color: #10b981;
                font-weight: bold;
            }
            
            @media print {
                .no-print { display: none !important; }
                .section { page-break-inside: avoid; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🛡️ RiskLens 风险透镜</h1>
            <h2>个人信息泄露风险分析报告</h2>
        </div>
        
        <div class="meta-info">
            <p><strong>分析用户：</strong>${username}</p>
            <p><strong>报告生成时间：</strong>${timestamp}</p>
            <p><strong>分析工具：</strong>RiskLens v1.0</p>
        </div>
        
        ${batchInfo}
        
        <div class="section">
            <div class="section-title">📊 风险总览</div>
            ${summaryContent}
        </div>
        
        <div class="section">
            <div class="section-title">⚠️ 风险详情</div>
            ${detailsContent}
        </div>
        
        <div class="section">
            <div class="section-title">💡 安全建议</div>
            ${recommendationsContent}
        </div>
        
        <div class="footer">
            <p>本报告由 RiskLens 风险透镜生成 | 请妥善保管此报告</p>
            <p>生成时间: ${timestamp}</p>
        </div>
    </body>
    </html>
    `;
}

// 降级JSON导出功能
function exportReportAsJSON() {
    const reportData = {
        timestamp: new Date().toISOString(),
        username: elements.username.value,
        summary: elements.riskSummary.textContent,
        details: elements.riskDetails.textContent,
        recommendations: elements.recommendations.textContent,
        exportFormat: 'JSON (fallback)'
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `risk-report-${elements.username.value}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('报告导出为JSON格式', 'info');
}

// 批次管理相关函数
async function generateCombinedReport(batchResults, username) {
    // 筛选出成功的批次
    const successfulBatches = batchResults.filter(batch => batch.status === 'completed' && batch.result);
    const failedBatches = batchResults.filter(batch => batch.status === 'failed');
    
    if (successfulBatches.length === 0) {
        // 如果没有成功的批次，返回错误报告
        return generateErrorOnlyReport(batchResults, username);
    }
    
    // 合并成功批次的分析结果
    let combinedRisks = [];
    let combinedRecommendations = [];
    let totalScore = 0;
    let highestRiskLevel = 'low';
    
    // 合并每个成功批次的结果
    successfulBatches.forEach(batch => {
        const result = batch.result;
        
        // 合并风险项目
        if (result.detectedRisks) {
            combinedRisks = combinedRisks.concat(result.detectedRisks.map(risk => ({
                ...risk,
                batchSource: `第${batch.batchNumber}轮`
            })));
        }
        
        // 合并建议（去重）
        if (result.recommendations) {
            result.recommendations.forEach(rec => {
                if (!combinedRecommendations.includes(rec)) {
                    combinedRecommendations.push(rec);
                }
            });
        }
        
        // 计算综合分数和风险等级
        if (result.riskScore) {
            totalScore += result.riskScore;
        }
        
        if (result.riskLevel) {
            if (result.riskLevel === 'high' || highestRiskLevel !== 'high') {
                if (result.riskLevel === 'high') {
                    highestRiskLevel = 'high';
                } else if (result.riskLevel === 'medium' && highestRiskLevel === 'low') {
                    highestRiskLevel = 'medium';
                }
            }
        }
    });
    
    // 计算平均分数
    const avgScore = Math.round(totalScore / successfulBatches.length);
    
    // 根据平均分数重新确定综合风险等级
    let combinedRiskLevel;
    if (avgScore >= 70) {
        combinedRiskLevel = 'high';
    } else if (avgScore >= 40) {
        combinedRiskLevel = 'medium';
    } else {
        combinedRiskLevel = 'low';
    }
    
    // 但如果所有批次都是高风险，则保持高风险
    const allHighRisk = successfulBatches.every(batch => batch.result.riskLevel === 'high');
    if (allHighRisk && successfulBatches.length > 1) {
        combinedRiskLevel = 'high';
    }
    
    
    // 生成综合总结
    const totalItems = successfulBatches.reduce((sum, batch) => sum + batch.totalItems, 0);
    const failedItems = failedBatches.reduce((sum, batch) => sum + batch.totalItems, 0);
    
    let combinedSummary;
    if (successfulBatches.length === 1) {
        combinedSummary = `对 ${totalItems} 条用户内容进行了完整分析。`;
    } else {
        combinedSummary = `经过 ${successfulBatches.length} 轮成功分析，共检查了 ${totalItems} 条用户内容。`;
    }
    
    if (failedBatches.length > 0) {
        combinedSummary += `另有 ${failedBatches.length} 轮分析失败，涉及 ${failedItems} 条内容。`;
    }
    
    combinedSummary += `发现了 ${combinedRisks.length} 个风险项目，综合风险评分为 ${avgScore} 分（基于 ${successfulBatches.length} 轮分析的平均值）。`;
    
    if (combinedRisks.length > 0) {
        combinedSummary += `主要风险集中在：${[...new Set(combinedRisks.map(r => r.type))].slice(0, 3).join('、')}等方面。`;
    } else {
        combinedSummary += '未发现明显的隐私泄露风险。';
    }
    
    // 如果有失败的批次，添加重试建议
    if (failedBatches.length > 0) {
        combinedRecommendations.unshift('建议重试失败的分析批次以获得更完整的风险评估');
    }
    
    // 按照风险等级从高到低排序风险项目
    const riskLevelPriority = { 'high': 3, 'medium': 2, 'low': 1 };
    combinedRisks.sort((a, b) => {
        const priorityA = riskLevelPriority[a.severity] || 0;
        const priorityB = riskLevelPriority[b.severity] || 0;
        return priorityB - priorityA; // 从高到低排序
    });
    
    const combinedResult = {
        riskLevel: combinedRiskLevel,
        riskScore: avgScore,
        summary: combinedSummary,
        detectedRisks: combinedRisks,
        recommendations: combinedRecommendations,
        analysisMetadata: {
            totalBatches: batchResults.length,
            successfulBatches: successfulBatches.length,
            failedBatches: failedBatches.length,
            totalContentAnalyzed: totalItems,
            failedContentCount: failedItems,
            analysisTimestamp: new Date().toISOString(),
            confidenceLevel: failedBatches.length > 0 ? 'medium' : 'high'
        }
    };
    
    // 确保全局变量也更新了总数
    window.totalAnalyzedContent = totalItems;
    
    // 存储综合风险等级到全局变量
    combinedRiskLevel = combinedResult.riskLevel;
    
    // 生成综合报告显示
    await generateRiskReport(combinedResult, username);
    
    // 绑定头像事件处理器（符合CSP策略）
    bindAvatarEventHandlers();
    
    return combinedResult;
}

// 生成纯错误报告（当所有批次都失败时）
async function generateErrorOnlyReport(batchResults, username) {
    const totalItems = batchResults.reduce((sum, batch) => sum + batch.totalItems, 0);
    const errorMessages = batchResults.map(batch => `第${batch.batchNumber}轮: ${batch.error || '未知错误'}`);
    
    const errorResult = {
        riskLevel: 'medium',
        riskScore: 50,
        summary: `所有 ${batchResults.length} 轮分析都失败了，共涉及 ${totalItems} 条内容。请检查配置后重试。`,
        detectedRisks: [
            {
                type: '分析失败',
                content: '所有批次分析均失败',
                severity: 'high',
                description: `分析失败原因：${errorMessages.join('; ')}`,
                recommendation: '请检查AI配置和网络连接后重试'
            }
        ],
        recommendations: [
            '检查AI API配置是否正确',
            '确认网络连接稳定',
            '尝试重新分析失败的批次',
            '如果问题持续，请联系技术支持'
        ],
        analysisMetadata: {
            totalBatches: batchResults.length,
            successfulBatches: 0,
            failedBatches: batchResults.length,
            totalContentAnalyzed: 0,
            failedContentCount: totalItems,
            analysisTimestamp: new Date().toISOString(),
            confidenceLevel: 'low'
        }
    };
    
    await generateRiskReport(errorResult, username);
    return errorResult;
}

function showBatchControls(show, isAnalyzing = false) {
    // 有多个批次或正在分析中时显示批次控制
    const shouldShow = show && (batchResults.length > 1 || totalBatches > 1);
    elements.batchControls.style.display = shouldShow ? 'block' : 'none';
    
    if (shouldShow) {
        if (isAnalyzing) {
            // 分析进行中的状态
            elements.batchSummary.innerHTML = `
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fas fa-cogs fa-spin" style="color: #2563eb;"></i>
                    正在分 <strong>${totalBatches}</strong> 轮进行分析，总计 <strong>${allUserData.length}</strong> 条内容
                </span>
            `;
        } else {
            // 分析完成的状态
            const totalItems = batchResults.reduce((sum, batch) => sum + batch.totalItems, 0);
            elements.batchSummary.innerHTML = `
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fas fa-check-circle" style="color: #10b981;"></i>
                    共分析了 <strong>${batchResults.length}</strong> 批数据，总计 <strong>${totalItems}</strong> 条内容
                </span>
            `;
        }
        
        // 生成批次标签 - 分析过程中也显示
        if (!isAnalyzing) {
            updateBatchTabs(); // 只有分析完成后才使用updateBatchTabs，避免与updateBatchProgressUI冲突
        }
    }
}

// 更新批次进度UI
function updateBatchProgressUI() {
    if (totalBatches <= 1) return;
    
    // 生成所有批次的标签，包括尚未分析的
    elements.batchTabs.innerHTML = '';
    
    // 添加综合报告标签（只有分析完成后才可点击）
    const summaryTab = document.createElement('div');
    summaryTab.className = 'batch-tab summary-tab';
    
    // 检查是否有任何成功的批次，如果有就允许点击查看综合报告
    const hasSuccessfulBatches = batchResults.some(batch => batch.status === 'completed');
    
    if (hasSuccessfulBatches || batchResults.length === totalBatches) {
        summaryTab.classList.add('clickable');
        summaryTab.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            switchToBatch('summary');
        });
    } else {
        summaryTab.classList.add('disabled');
    }
    summaryTab.innerHTML = generateSummaryTabContent();
    elements.batchTabs.appendChild(summaryTab);
    
    // 添加各个批次的标签
    for (let i = 1; i <= totalBatches; i++) {
        const tab = document.createElement('div');
        tab.className = 'batch-tab';
        tab.id = `batch-tab-${i}`;
        
        const startIdx = (i - 1) * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, allUserData.length);
        const itemCount = endIdx - startIdx;
        
        // 根据状态设置样式和内容
        const completedBatch = batchResults.find(b => b.batchNumber === i);
        if (completedBatch) {
            tab.classList.add('completed', 'clickable');
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                switchToBatch(batchResults.indexOf(completedBatch));
            });
        } else if (currentBatch === i) {
            tab.classList.add('analyzing', 'clickable');
            // 为正在分析的批次添加点击事件 - 修复CSP问题
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                switchToBatch(i - 1); // 传递批次索引（从0开始）
            });
        } else {
            tab.classList.add('pending');
        }
        
        tab.innerHTML = `
            <span class="batch-number">第${i}轮 <span class="batch-status">${getBatchStatusIcon(i)}</span></span>
            <span class="batch-count">${itemCount}条</span>
        `;
        
        elements.batchTabs.appendChild(tab);
    }
}

// 更新批次标签
function updateBatchTabs() {
    elements.batchTabs.innerHTML = '';
    
    // 添加综合报告标签
    const summaryTab = document.createElement('div');
    summaryTab.className = 'batch-tab active';
    summaryTab.innerHTML = generateSummaryTabContent();
    summaryTab.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        switchToBatch('summary');
    });
    elements.batchTabs.appendChild(summaryTab);
    
    // 添加各个批次的标签
    batchResults.forEach((batch, index) => {
        const tab = document.createElement('div');
        tab.id = `batch-tab-${batch.batchNumber}`;
        tab.className = batch.status === 'failed' ? 'batch-tab failed clickable' : 'batch-tab completed clickable';
        
        // 添加状态图标
        let statusIcon = '';
        if (batch.status === 'failed') {
            statusIcon = '<span class="batch-status"><i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i></span>';
        } else if (batch.result && batch.result.riskLevel) {
            const riskIcon = getRiskLevelIcon(batch.result.riskLevel);
            const riskColor = getRiskLevelColor(batch.result.riskLevel);
            statusIcon = `<span class="batch-status"><i class="${riskIcon}" style="color: ${riskColor};"></i></span>`;
        } else {
            statusIcon = '<span class="batch-status"><i class="fas fa-check-circle" style="color: #10b981;"></i></span>';
        }
        
        tab.innerHTML = `
            <span class="batch-number">第${batch.batchNumber}轮 ${statusIcon}</span>
            <span class="batch-count">${batch.totalItems}条</span>
        `;
        tab.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            switchToBatch(index);
        });
        elements.batchTabs.appendChild(tab);
    });
}

// 标记批次为分析中
function markBatchAsAnalyzing(batchNumber) {
    const tab = document.getElementById(`batch-tab-${batchNumber}`);
    if (tab) {
        // 保留clickable类，确保正在分析的批次仍然可以点击
        tab.className = 'batch-tab analyzing clickable';
        const statusSpan = tab.querySelector('.batch-status');
        if (statusSpan) {
            statusSpan.innerHTML = '<i class="fas fa-cog fa-spin" style="color: #2563eb;"></i>';
        }
        
        // 关键修复：为正在分析的批次添加点击事件监听器
        // 先移除可能存在的旧监听器，避免重复绑定
        const oldClickHandler = tab._clickHandler;
        if (oldClickHandler) {
            tab.removeEventListener('click', oldClickHandler);
        }
        
        // 添加新的点击事件监听器
        const clickHandler = (event) => {
            event.preventDefault();
            event.stopPropagation();
            switchToBatch(batchNumber - 1); // 传递批次索引（从0开始）
        };
        
        tab.addEventListener('click', clickHandler);
        tab._clickHandler = clickHandler; // 保存引用以便后续移除
    }
}

// 标记批次为已完成
function markBatchAsCompleted(batchNumber, batchResult) {
    const tab = document.getElementById(`batch-tab-${batchNumber}`);
    if (tab) {
        tab.className = 'batch-tab completed clickable';
        const statusSpan = tab.querySelector('.batch-status');
        if (statusSpan) {
            const riskIcon = getRiskLevelIcon(batchResult.riskLevel);
            statusSpan.innerHTML = `<i class="${riskIcon}" style="color: ${getRiskLevelColor(batchResult.riskLevel)};"></i>`;
        }
        
        // 添加点击事件 - 符合CSP策略
        tab.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const index = batchResults.findIndex(b => b.batchNumber === batchNumber);
            if (index !== -1) {
                switchToBatch(index);
            }
        });
    }
}

// 标记批次为失败
function markBatchAsFailed(batchNumber, error) {
    const tab = document.getElementById(`batch-tab-${batchNumber}`);
    if (tab) {
        tab.className = 'batch-tab failed clickable';
        const statusSpan = tab.querySelector('.batch-status');
        if (statusSpan) {
            statusSpan.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>';
        }
        
        // 添加点击事件查看错误详情 - 符合CSP策略  
        tab.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const index = batchResults.findIndex(b => b.batchNumber === batchNumber);
            if (index !== -1) {
                switchToBatch(index);
            }
        });
    }
}

// 显示批次错误信息
function showBatchError(batch, batchIndex) {
    const errorMessage = batch.error || '分析过程中发生未知错误';
    const username = elements.username.value || '用户';
    
    // 生成错误报告
    const errorHtml = `
        <div class="risk-summary">
            <div class="risk-level">
                <div class="risk-level-info">
                    <div class="risk-level-icon high">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="risk-level-text">
                        <div class="risk-level-title">${username} - 第${batch.batchNumber}轮分析失败</div>
                        <div class="risk-level-subtitle">
                            分析内容：${batch.startIndex + 1} - ${batch.endIndex} 条 | 总计 ${batch.totalItems} 条内容
                        </div>
                    </div>
                </div>
                <div class="risk-badge high">分析失败</div>
            </div>
            
            <div class="error-details">
                <h4><i class="fas fa-bug"></i> 错误详情</h4>
                <div class="error-message">
                    ${errorMessage}
                </div>
                
                <div class="retry-section">
                    <button class="btn btn-primary" id="retry-btn-${batchIndex}" data-batch-index="${batchIndex}">
                        <i class="fas fa-redo"></i>
                        重新分析此批次
                    </button>
                    <button class="btn btn-secondary" id="skip-btn-${batchIndex}" data-batch-index="${batchIndex}">
                        <i class="fas fa-skip-forward"></i>
                        跳过此批次
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // 显示错误信息
    elements.riskSummary.innerHTML = errorHtml;
    elements.riskDetails.innerHTML = '<div class="no-details">请重新分析或跳过此批次</div>';
    elements.recommendations.innerHTML = `
        <h4><i class="fas fa-lightbulb"></i> 建议操作</h4>
        <ul class="recommendations-list">
            <li>检查网络连接是否稳定</li>
            <li>确认AI API配置是否正确</li>
            <li>尝试重新分析此批次</li>
            <li>如果问题持续，可以跳过此批次继续查看其他结果</li>
        </ul>
    `;

    // 添加按钮事件监听器
    setTimeout(() => {
        const retryBtn = document.getElementById(`retry-btn-${batchIndex}`);
        const skipBtn = document.getElementById(`skip-btn-${batchIndex}`);
        
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                retryBatch(batchIndex);
            });
        }
        
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                skipBatch(batchIndex);
            });
        }
    }, 100); // 短暂延迟确保DOM元素已渲染
}

// 重试失败的批次
async function retryBatch(batchIndex) {
    const batch = batchResults[batchIndex];
    if (!batch || batch.status !== 'failed') {
        console.error('无法重试批次:', batchIndex);
        return;
    }
    
    
    try {
        // 更新UI状态为重试中
        markBatchAsAnalyzing(batch.batchNumber);
        showNotification(`正在重试第${batch.batchNumber}轮分析...`, 'info');
        
        // 使用保存的数据和配置重新分析
        const batchResult = await analyzeWithAI(batch.batchData, batch.config, batch.batchNumber, totalBatches);
        
        // 更新批次结果
        batch.result = batchResult;
        batch.status = 'completed';
        batch.error = null;
        
        // 更新UI状态为完成
        markBatchAsCompleted(batch.batchNumber, batchResult);
        
        // 重新生成当前批次的报告
        const batchReportResult = {
            ...batchResult,
            summary: `第${batch.batchNumber}轮分析结果 (${batch.startIndex + 1} - ${batch.endIndex}条内容，重试成功)：${batchResult.summary || '分析完成'}`
        };
        
        const originalUsername = elements.username.value || '用户';
        await generateRiskReport(batchReportResult, `${originalUsername} (第${batch.batchNumber}轮)`);
        
        // 绑定头像事件处理器（符合CSP策略）
        bindAvatarEventHandlers();
        
        showNotification(`第${batch.batchNumber}轮重试成功！`, 'success');
        
        // 如果所有批次都完成了，重新生成综合报告
        const allCompleted = batchResults.every(b => b.status === 'completed');
        if (allCompleted) {
            await generateCombinedReport(batchResults, originalUsername);
        }
        
    } catch (error) {
        console.error(`第${batch.batchNumber}轮重试失败:`, error);
        
        // 更新错误信息
        batch.error = error.message;
        markBatchAsFailed(batch.batchNumber, error);
        
        showNotification(`第${batch.batchNumber}轮重试失败: ${error.message}`, 'error');
        
        // 重新显示错误页面
        showBatchError(batch, batchIndex);
    }
}

// 跳过失败的批次
function skipBatch(batchIndex) {
    const batch = batchResults[batchIndex];
    if (!batch) {
        return;
    }
    
    showNotification(`已跳过第${batch.batchNumber}轮，查看其他结果`, 'info');
    
    // 切换到综合报告
    switchToBatch('summary');
}


// 获取批次状态图标
function getBatchStatusIcon(batchNumber) {
    const completedBatch = batchResults.find(b => b.batchNumber === batchNumber);
    if (completedBatch) {
        const riskIcon = getRiskLevelIcon(completedBatch.result.riskLevel);
        return `<i class="${riskIcon}" style="color: ${getRiskLevelColor(completedBatch.result.riskLevel)};"></i>`;
    } else if (currentBatch === batchNumber) {
        return '<i class="fas fa-cog fa-spin" style="color: #2563eb;"></i>';
    } else {
        return '<i class="fas fa-clock" style="color: #9ca3af;"></i>';
    }
}

// 获取风险等级图标
function getRiskLevelIcon(riskLevel) {
    const icons = {
        low: 'fas fa-check-circle',
        medium: 'fas fa-exclamation-triangle', 
        high: 'fas fa-exclamation-circle'
    };
    return icons[riskLevel] || 'fas fa-question-circle';
}

// 生成综合报告标签的HTML内容
function generateSummaryTabContent() {
    if (combinedRiskLevel) {
        const riskIcon = getRiskLevelIcon(combinedRiskLevel);
        const riskColor = getRiskLevelColor(combinedRiskLevel);
        return `
            <span class="batch-number">📊 综合报告 <span class="batch-status"><i class="${riskIcon}" style="color: ${riskColor};"></i></span></span>
            <span class="batch-count">全部</span>
        `;
    } else {
        return `
            <span class="batch-number">📊 综合报告</span>
            <span class="batch-count">全部</span>
        `;
    }
}

async function switchToBatch(batchIndex) {
    
    // 更新所有标签状态 - 移除active类
    const tabs = elements.batchTabs.querySelectorAll('.batch-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    if (batchIndex === 'summary') {
        // 显示综合报告 - 激活第一个标签（综合报告）
        const summaryTab = tabs[0];
        if (summaryTab) {
            summaryTab.classList.add('active');
        }
        
        // 切换到综合报告时，隐藏AI响应框，显示报告内容
        showAIResponseDisplay(false);
        
        // 重新生成综合报告以确保内容正确显示
        const originalUsername = elements.username.value || '用户';
        if (batchResults.length > 0) {
            await generateCombinedReport(batchResults, originalUsername);
            showNotification('综合报告已更新', 'info');
        } else {
            elements.riskSummary.innerHTML = '<div class="no-results">暂无分析结果，请先进行风险分析</div>';
            elements.riskDetails.innerHTML = '';
            elements.recommendations.innerHTML = '';
        }
        return;
    }
    
    // 显示特定批次的结果
    const targetTabIndex = batchIndex + 1; // +1是因为第0个是综合报告
    const targetTab = tabs[targetTabIndex];
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // 修复：首先检查是否是正在分析的批次
    if (batchIndex + 1 === currentBatch && isAnalyzing && isAIAnalyzing) {
        
        // 确保AI流式响应显示，但不重置已有内容
        showAIResponseDisplay(true, false); // false表示不重置内容
        
        // 如果当前没有内容，则设置默认提示
        const currentContent = elements.aiResponseText.innerHTML.trim();
        if (!currentContent || currentContent === formatAIResponseContent('正在连接AI服务，准备开始分析...')) {
            elements.aiResponseText.innerHTML = formatAIResponseContent('AI正在分析中，请稍候...');
            updateResponseStats(0, '正在分析');
        }
        
        // 设置分析状态提示
        updateAnalysisStatus(`正在分析第${currentBatch}轮数据...`, `AI正在处理第${currentBatch}/${totalBatches}批数据`, 2);
        
        return;
    }
    
    // 然后查找已完成的批次数据
    const batch = batchResults[batchIndex];
    if (!batch) {
        console.error('找不到批次数据:', batchIndex);
        // 确保隐藏AI响应框，显示报告内容区域
        showAIResponseDisplay(false);
        elements.riskSummary.innerHTML = '<div class="no-results">找不到该批次的分析结果</div>';
        elements.riskDetails.innerHTML = '';
        elements.recommendations.innerHTML = '';
        return;
    }
    
    
    // 切换到已完成批次时，隐藏AI响应框，显示报告内容
    showAIResponseDisplay(false);
    
    // 检查批次是否分析失败
    if (!batch.result || batch.result.riskLevel === undefined) {
        showBatchError(batch, batchIndex);
        return;
    }
    
    // 使用该批次的结果重新生成报告显示
    const batchResult = {
        ...batch.result,
        summary: `第${batch.batchNumber}轮分析结果 (${batch.startIndex + 1} - ${batch.endIndex}条内容)：${batch.result.summary || '分析完成'}`
    };
    
    // 使用原始用户名而不是批次标识
    const originalUsername = elements.username.value || '用户';
    await generateRiskReport(batchResult, `${originalUsername} (第${batch.batchNumber}轮)`);
    
    // 绑定头像事件处理器（符合CSP策略）
    bindAvatarEventHandlers();
    
}

// 内容过滤和去重工具函数
function isUselessContent(content) {
    if (!content || typeof content !== 'string') return true;
    
    const trimmed = content.trim();
    
    // 过滤过短的内容（系统最低要求4个字）
    if (trimmed.length < 4) return true;
    
    // 过滤无用的常见回复（考虑系统最低4字要求）
    const uselessPatterns = [
        /^谢谢大佬$/,
        /^谢谢谢谢$/,
        /^谢谢大大$/,
        /^谢谢老哥$/,
        /^感谢分享$/,
        /^感谢大佬$/,
        /^好的谢谢$/,
        /^了解了$/,
        /^明白了$/,
        /^收到了$/,
        /^好的好的$/,
        /^是的是的$/,
        /^对的对的$/,
        /^哈哈哈哈$/,
        /^呵呵呵呵$/,
        /^顶顶顶顶$/,
        /^支持支持$/,
        /^不错不错$/,
        /^学习了$/,
        /^涨知识$/,
        /^厉害厉害$/,
        /^牛逼牛逼$/,
        /^好厉害$/,
        /^太棒了$/,
        /^很棒很棒$/,
        /^👍👍👍👍$/,
        /^😄😄😄😄$/,
        /^😂😂😂😂$/,
        /^👌👌👌👌$/,
        /^[\u{1F600}-\u{1F64F}]{4,}$/u,
        /^[\u{1F300}-\u{1F5FF}]{4,}$/u,
        /^[\u{1F680}-\u{1F6FF}]{4,}$/u
    ];
    
    // 检查是否匹配无用模式
    for (const pattern of uselessPatterns) {
        if (pattern.test(trimmed)) {
            return true;
        }
    }
    
    // 过滤纯emoji或纯标点的内容
    const emojiOnlyPattern = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`\s]+$/u;
    if (emojiOnlyPattern.test(trimmed)) {
        return true;
    }
    
    return false;
}

function removeDuplicateContent(userData) {
    if (!Array.isArray(userData)) return userData;
    
    const seen = new Set();
    const uniqueData = [];
    
    for (const item of userData) {
        if (!item.content) continue;
        
        // 规范化内容进行比较（去除多余空白、转换为小写）
        const normalizedContent = item.content.replace(/\s+/g, ' ').trim().toLowerCase();
        
        // 跳过过短的内容（最少5个字符才有分析价值）
        if (normalizedContent.length < 5) continue;
        
        // 检查是否已存在相同或相似的内容
        let isDuplicate = false;
        for (const existingContent of seen) {
            if (calculateSimilarity(normalizedContent, existingContent) > 0.85) {
                isDuplicate = true;
                break;
            }
        }
        
        if (!isDuplicate) {
            seen.add(normalizedContent);
            uniqueData.push(item);
        }
    }
    
    return uniqueData;
}

// 计算文本相似度（简单的Jaccard相似度）
function calculateSimilarity(text1, text2) {
    if (text1 === text2) return 1;
    
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
}

// 头像预加载和缓存函数 - 改进版本，使用现代图片加载方法
function preloadUserAvatar(avatarUrl, username) {
    return new Promise((resolve, reject) => {
        // 首先检查图片是否已在浏览器缓存中
        if (window.currentUserAvatar === avatarUrl) {
            resolve(avatarUrl);
            return;
        }

        const img = new Image();
        let attempts = 0;
        const maxAttempts = 3;
        
        const tryLoad = () => {
            attempts++;
            
            // 使用现代图片加载最佳实践 - 符合CSP安全策略
            img.addEventListener('load', () => {
                window.currentUserAvatar = avatarUrl;
                resolve(avatarUrl);
            }, { once: true });
            
            img.addEventListener('error', () => {
                console.warn(`用户 ${username} 的头像预加载失败 (尝试 ${attempts}/${maxAttempts})`);
                
                if (attempts < maxAttempts) {
                    // 使用指数退避策略重试
                    const delay = Math.pow(2, attempts - 1) * 1000; // 1s, 2s, 4s
                    setTimeout(() => {
                        tryLoad();
                    }, delay);
                } else {
                    console.error(`用户 ${username} 的头像预加载完全失败，将使用默认图标`);
                    window.currentUserAvatar = null;
                    reject(new Error('头像加载失败'));
                }
            }, { once: true });
            
            // 设置更好的加载属性
            img.crossOrigin = 'anonymous'; // 处理跨域问题
            img.referrerPolicy = 'no-referrer'; // 避免referrer问题
            
            // 不添加时间戳，让浏览器使用缓存机制
            // 但在重试时添加cache-busting参数
            if (attempts > 1) {
                img.src = `${avatarUrl}?retry=${attempts}&t=${Date.now()}`;
            } else {
                img.src = avatarUrl;
            }
        };
        
        tryLoad();
    });
}

// 绑定头像事件处理器 - 符合CSP安全策略
function bindAvatarEventHandlers() {
    // 查找所有动态生成的头像图片
    const avatarImages = document.querySelectorAll('.risk-avatar-img[data-username]');
    
    avatarImages.forEach(img => {
        // 移除可能存在的旧事件监听器
        const newImg = img.cloneNode(true);
        img.parentNode.replaceChild(newImg, img);
        
        // 添加加载成功事件
        newImg.addEventListener('load', function() {
            this.style.display = 'block';
            const fallback = this.nextElementSibling;
            if (fallback && fallback.classList.contains('risk-avatar-fallback')) {
                fallback.style.display = 'none';
            }
        }, { once: true });
        
        // 添加加载失败事件
        newImg.addEventListener('error', function() {
            console.warn('头像加载失败，显示默认图标:', this.getAttribute('data-username'));
            this.style.display = 'none';
            const fallback = this.nextElementSibling;
            if (fallback && fallback.classList.contains('risk-avatar-fallback')) {
                fallback.style.display = 'flex';
            }
        }, { once: true });
    });
}

// 批次点击调试函数
function debugBatchClicks() {
    const batchTabs = document.querySelectorAll('.batch-tab');
    
    batchTabs.forEach((tab, index) => {
        const clickableClass = tab.classList.contains('clickable') ? 'YES' : 'NO';
        const analyzingClass = tab.classList.contains('analyzing') ? 'YES' : 'NO';
        
        // 检查是否有点击事件监听器
        const hasClickEvents = tab.onclick !== null || tab.addEventListener.length > 0;
    });
}

// 添加全局调试函数
window.debugBatchClicks = debugBatchClicks;

// CSP修复完成状态检查函数
window.checkCSPCompliance = function() {
    
    // 检查是否有内联事件处理器
    const elementsWithInlineEvents = document.querySelectorAll('*[onclick], *[onload], *[onerror]');
    if (elementsWithInlineEvents.length === 0) {
    } else {
    }
    
    // 检查批次点击功能
    const batchTabs = document.querySelectorAll('.batch-tab.clickable');
    
    // 检查头像元素
    const avatars = document.querySelectorAll('.risk-avatar-img');
    
    return {
        inlineEvents: elementsWithInlineEvents.length,
        clickableBatches: batchTabs.length,
        avatars: avatars.length
    };
};

// 工具函数
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function getApiKeyStrength(key) {
    if (key.length < 10) return 'weak';
    if (key.length < 20) return 'medium';
    return 'strong';
}

function getRiskLevelText(level) {
    const texts = {
        low: '低风险',
        medium: '中风险', 
        high: '高风险'
    };
    return texts[level] || '未知';
}

function getConfidenceLevelText(level) {
    const texts = {
        high: '高可信度',
        medium: '中等可信度',
        low: '低可信度'
    };
    return texts[level] || '中等可信度';
}

function getRiskScoreDescription(score, level) {
    if (score >= 80) {
        return '存在严重隐私泄露风险，建议立即采取防护措施';
    } else if (score >= 60) {
        return '存在明显隐私风险，建议加强个人信息保护';
    } else if (score >= 40) {
        return '存在一定隐私风险，建议注意信息分享尺度';
    } else if (score >= 20) {
        return '隐私风险较低，但仍需保持警惕';
    } else {
        return '隐私保护状况良好，继续保持谨慎分享习惯';
    }
}

function getRiskLevelColor(level) {
    const colors = {
        low: '#27ae60',
        medium: '#f39c12',
        high: '#e74c3c'
    };
    return colors[level] || '#95a5a6';
}

function getRiskIcon(type) {
    const icons = {
        '邮箱地址': 'fa-envelope',
        '电话号码': 'fa-phone',
        '真实姓名': 'fa-user',
        '身份证号码': 'fa-id-card',
        '家庭住址': 'fa-home',
        '公司信息': 'fa-building',
        '银行卡信息': 'fa-credit-card',
        '默认': 'fa-exclamation-triangle'
    };
    return icons[type] || icons['默认'];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    // 添加样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${getNotificationBg(type)};
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    // 自动移除
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function getNotificationIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    return icons[type] || icons.info;
}

function getNotificationBg(type) {
    const colors = {
        success: '#27ae60',
        error: '#e74c3c',
        warning: '#f39c12',
        info: '#3498db'
    };
    return colors[type] || colors.info;
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;

// 初始化当前用户信息
async function initializeCurrentUser() {
    try {
        showUserInfoLoading();
        
        // 尝试获取当前活动标签页的信息
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        let currentTab = null;
        
        // 找到linux.do标签页
        for (const tab of tabs) {
            if (tab.url && tab.url.includes('linux.do')) {
                currentTab = tab;
                break;
            }
        }
        
        // 如果当前标签页不是linux.do，尝试找其他linux.do标签页
        if (!currentTab) {
            const allTabs = await chrome.tabs.query({ url: '*://linux.do/*' });
            if (allTabs.length > 0) {
                currentTab = allTabs[0];
            }
        }
        
        if (!currentTab) {
            showUserInfoError('请先打开 linux.do 网站');
            return;
        }
        
        // 确保内容脚本已加载并获取用户信息
        const response = await ensureContentScriptAndGetUser(currentTab);
        
        if (response && response.currentUser && response.isLoggedIn) {
            showUserInfo(response.currentUser);
            // 设置隐藏的用户名输入框
            elements.username.value = response.currentUser.username;
        } else if (response && response.isLinuxDo && !response.isLoggedIn) {
            showUserInfoNotLoggedIn();
        } else {
            showUserInfoError('无法获取用户信息，请确保已登录 linux.do');
        }
        
    } catch (error) {
        console.error('[RiskLens] 初始化用户信息失败:', error);
        handleUserInfoError(error);
    }
}

// 确保内容脚本已加载并获取用户信息
async function ensureContentScriptAndGetUser(tab, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[RiskLens] 尝试获取用户信息 (第${attempt}次尝试)`);
            
            // 首先确保内容脚本已注入
            await ensureContentScriptInjected(tab);
            
            // 等待一小段时间确保脚本完全初始化
            await sleep(300);
            
            // 发送消息获取用户信息
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'checkSite' 
            });
            
            if (response) {
                console.log(`[RiskLens] 成功获取用户信息:`, response);
                return response;
            }
            
        } catch (error) {
            console.warn(`[RiskLens] 第${attempt}次尝试失败:`, error.message);
            
            // 如果是连接错误，尝试重新注入内容脚本
            if (error.message.includes('Could not establish connection') || 
                error.message.includes('Receiving end does not exist')) {
                
                if (attempt < maxRetries) {
                    console.log(`[RiskLens] 检测到连接错误，将在500ms后重试...`);
                    await sleep(500);
                    continue;
                }
            }
            
            // 最后一次尝试失败，抛出错误
            if (attempt === maxRetries) {
                throw error;
            }
        }
    }
    
    throw new Error('多次尝试后仍无法建立连接');
}

// 确保内容脚本已注入
async function ensureContentScriptInjected(tab) {
    try {
        // 检查页面是否完全加载
        if (tab.status !== 'complete') {
            console.log('[RiskLens] 等待页面加载完成...');
            await waitForTabComplete(tab.id);
        }
        
        // 尝试注入内容脚本（如果尚未注入）
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
        
        console.log('[RiskLens] 内容脚本注入成功');
        
    } catch (error) {
        // 如果脚本已经注入，会出现错误，这是正常的
        if (error.message.includes('Cannot access') || 
            error.message.includes('The extensions gallery')) {
            throw new Error('无法在此页面注入脚本，请确保在 linux.do 网站上操作');
        }
        
        console.log('[RiskLens] 内容脚本可能已存在或注入完成');
    }
}

// 等待标签页加载完成
async function waitForTabComplete(tabId, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab.status === 'complete') {
                return;
            }
        } catch (error) {
            throw new Error('标签页已关闭或无法访问');
        }
        
        await sleep(100);
    }
    
    throw new Error('等待页面加载超时');
}

// 处理用户信息获取错误
function handleUserInfoError(error) {
    console.error('[RiskLens] 用户信息获取错误:', error);
    
    if (error.message.includes('Could not establish connection') || 
        error.message.includes('Receiving end does not exist')) {
        showUserInfoError('连接失败，请刷新 linux.do 页面后重试');
    } else if (error.message.includes('Cannot access') || 
               error.message.includes('The extensions gallery')) {
        showUserInfoError('请在 linux.do 网站上使用此工具');
    } else if (error.message.includes('标签页已关闭')) {
        showUserInfoError('linux.do 标签页已关闭，请重新打开');
    } else if (error.message.includes('等待页面加载超时')) {
        showUserInfoError('页面加载超时，请刷新后重试');
    } else {
        showUserInfoError('获取用户信息失败：' + error.message);
    }
}

// 显示用户信息加载状态
function showUserInfoLoading() {
    elements.currentUserDisplay.innerHTML = `
        <div class="user-info-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>正在获取用户信息...</span>
        </div>
    `;
}

// 显示用户信息
function showUserInfo(userInfo) {
    const avatarUrl = userInfo.avatarUrl || 
        (userInfo.avatarTemplate ? `https://linux.do${userInfo.avatarTemplate.replace('{size}', '64')}` : '');
    const displayName = userInfo.name || userInfo.username;
    const username = userInfo.username;
    
    elements.currentUserDisplay.innerHTML = `
        <div class="user-info-professional">
            <div class="user-avatar-section">
                ${avatarUrl ? 
                    `<img src="${avatarUrl}" alt="${username}" class="user-professional-avatar" id="userAvatarImg">` : 
                    `<div class="user-professional-avatar-fallback">
                        <i class="fas fa-user"></i>
                    </div>`
                }
            </div>
            <div class="user-name-section">
                <h3 class="user-display-name">${displayName}</h3>
                <span class="user-username">@${username}</span>
            </div>
            <div class="security-message">
                <i class="fas fa-shield-alt"></i>
                <span>安全模式：仅分析您自己的数据，保护隐私安全</span>
            </div>
        </div>
    `;
    
    // 为头像图片添加安全的错误处理事件监听器
    const avatarImg = document.getElementById('userAvatarImg');
    if (avatarImg) {
        avatarImg.addEventListener('error', function() {
            this.style.display = 'none';
        });
    }
    
    // 启用分析按钮
    elements.startAnalysis.disabled = false;
    elements.startAnalysis.title = '开始分析当前用户的风险数据';
    
    console.log(`[RiskLens Security] 当前用户: ${username}, 安全限制: 只能分析自己的数据`);
}

// 显示用户未登录状态
function showUserInfoNotLoggedIn() {
    elements.currentUserDisplay.innerHTML = `
        <div class="user-info-not-logged-in">
            <i class="fas fa-exclamation-triangle"></i>
            <span>请先登录 linux.do 账户</span>
        </div>
    `;
    
    // 禁用分析按钮
    elements.startAnalysis.disabled = true;
    elements.startAnalysis.title = '请先登录 linux.do 账户';
}

// 显示用户信息错误状态
function showUserInfoError(message) {
    elements.currentUserDisplay.innerHTML = `
        <div class="user-info-error">
            <i class="fas fa-exclamation-circle"></i>
            <div class="error-content">
                <span>${message}</span>
                <button class="retry-btn" id="userInfoRetryBtn">
                    <i class="fas fa-redo"></i>
                    重试
                </button>
            </div>
        </div>
    `;
    
    // 绑定重试按钮事件
    const retryBtn = document.getElementById('userInfoRetryBtn');
    if (retryBtn) {
        retryBtn.addEventListener('click', handleRefreshUser);
    }
    
    // 禁用分析按钮
    elements.startAnalysis.disabled = true;
    elements.startAnalysis.title = message;
}

// 处理刷新用户信息按钮点击
async function handleRefreshUser() {
    // 防止重复点击
    if (elements.refreshUserBtn.classList.contains('loading')) {
        return;
    }
    
    // 设置加载状态
    elements.refreshUserBtn.classList.add('loading');
    elements.refreshUserBtn.disabled = true;
    
    try {
        await refreshUserInfo();
        showNotification('用户信息已刷新', 'success');
    } catch (error) {
        showNotification('刷新失败: ' + error.message, 'error');
    } finally {
        // 恢复按钮状态
        elements.refreshUserBtn.classList.remove('loading');
        elements.refreshUserBtn.disabled = false;
    }
}

// 刷新用户信息
async function refreshUserInfo() {
    await initializeCurrentUser();
}

document.head.appendChild(style);
