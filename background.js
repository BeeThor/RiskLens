// 后台服务脚本

// 扩展安装/更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
    console.log('RiskLens 风险透镜已安装/更新');
    
    if (details.reason === 'install') {
        // 首次安装时的初始化
        initializeExtension();
    } else if (details.reason === 'update') {
        // 更新时的处理
        handleExtensionUpdate(details.previousVersion);
    }
});

// 监听来自内容脚本和popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('收到消息:', request);
    
    switch (request.action) {
        case 'openPopup':
            // 兼容性保留 - 打开分析页面
            openDashboardTab(sender.tab);
            break;
            
        case 'openDashboard':
            // 打开分析页面
            openDashboardTab(sender.tab);
            break;
            
        case 'checkPermissions':
            // 检查权限
            checkExtensionPermissions()
                .then(sendResponse)
                .catch(error => sendResponse({ error: error.message }));
            return true;
            
        case 'requestPermissions':
            // 请求额外权限
            requestAdditionalPermissions(request.permissions)
                .then(sendResponse)
                .catch(error => sendResponse({ error: error.message }));
            return true;
            
        case 'logAnalysis':
            // 记录分析日志
            logAnalysisActivity(request.data);
            break;
            
        case 'getAnalysisHistory':
            // 获取分析历史
            getAnalysisHistory()
                .then(sendResponse)
                .catch(error => sendResponse({ error: error.message }));
            return true;
    }
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('linux.do')) {
        // 在linux.do页面加载完成时注入内容脚本
        injectContentScript(tabId);
    }
});

// 扩展图标点击处理 - 打开标签页
chrome.action.onClicked.addListener(async (tab) => {
    console.log('扩展图标被点击，打开分析页面');
    
    try {
        // 检查是否已经打开了分析页面
        const existingTabs = await chrome.tabs.query({ url: chrome.runtime.getURL("dashboard.html") });
        
        if (existingTabs.length > 0) {
            // 如果已经存在，则激活该标签页
            await chrome.tabs.update(existingTabs[0].id, { active: true });
            await chrome.windows.update(existingTabs[0].windowId, { focused: true });
        } else {
            // 如果不存在，则创建新的标签页
            let url = chrome.runtime.getURL("dashboard.html");
            
            // 如果当前页面是linux.do的用户页面，尝试提取用户名
            if (tab.url && tab.url.includes('linux.do')) {
                const match = tab.url.match(/\/u\/([^\/]+)/);
                if (match) {
                    url += `?username=${encodeURIComponent(match[1])}`;
                }
            }
            
            await chrome.tabs.create({ url: url });
        }
    } catch (error) {
        console.error('打开分析页面失败:', error);
        // 如果出错，就简单地创建一个新标签页
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    }
});

/**
 * 打开分析标签页
 */
async function openDashboardTab(currentTab) {
    try {
        // 检查是否已经打开了分析页面
        const existingTabs = await chrome.tabs.query({ url: chrome.runtime.getURL("dashboard.html") });
        
        if (existingTabs.length > 0) {
            // 如果已经存在，则激活该标签页
            await chrome.tabs.update(existingTabs[0].id, { active: true });
            await chrome.windows.update(existingTabs[0].windowId, { focused: true });
        } else {
            // 如果不存在，则创建新的标签页
            let url = chrome.runtime.getURL("dashboard.html");
            
            // 如果当前页面是linux.do的用户页面，尝试提取用户名
            if (currentTab && currentTab.url && currentTab.url.includes('linux.do')) {
                const match = currentTab.url.match(/\/u\/([^\/]+)/);
                if (match) {
                    url += `?username=${encodeURIComponent(match[1])}`;
                }
            }
            
            await chrome.tabs.create({ url: url });
        }
    } catch (error) {
        console.error('打开分析页面失败:', error);
        // 如果出错，就简单地创建一个新标签页
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    }
}

/**
 * 初始化扩展
 */
async function initializeExtension() {
    try {
        // 设置默认配置
        const defaultConfig = {
            modelName: '',
            apiUrl: '',
            apiKey: '',
            timeout: 30,
            theme: 'light',
            autoAnalyze: false,
            historyEnabled: true,
            maxHistoryEntries: 50
        };
        
        // 只设置不存在的配置项
        const currentConfig = await chrome.storage.sync.get(Object.keys(defaultConfig));
        const newConfig = {};
        
        for (const [key, value] of Object.entries(defaultConfig)) {
            if (!(key in currentConfig)) {
                newConfig[key] = value;
            }
        }
        
        if (Object.keys(newConfig).length > 0) {
            await chrome.storage.sync.set(newConfig);
            console.log('默认配置已设置:', newConfig);
        }
        
        // 初始化分析历史
        const history = await chrome.storage.local.get('analysisHistory');
        if (!history.analysisHistory) {
            await chrome.storage.local.set({ analysisHistory: [] });
        }
        
        console.log('扩展初始化完成');
        
    } catch (error) {
        console.error('扩展初始化失败:', error);
    }
}

/**
 * 处理扩展更新
 */
async function handleExtensionUpdate(previousVersion) {
    console.log(`扩展从版本 ${previousVersion} 更新到当前版本`);
    
    try {
        // 执行版本迁移逻辑
        await migrateDataIfNeeded(previousVersion);
        
        // 清理旧数据
        await cleanupOldData();
        
        console.log('扩展更新处理完成');
    } catch (error) {
        console.error('扩展更新处理失败:', error);
    }
}

/**
 * 数据迁移
 */
async function migrateDataIfNeeded(previousVersion) {
    // 根据版本号进行数据迁移
    const currentVersion = chrome.runtime.getManifest().version;
    
    if (compareVersions(previousVersion, '1.0.0') < 0) {
        // 从1.0.0之前的版本迁移
        console.log('执行1.0.0版本迁移');
        // 这里可以添加具体的迁移逻辑
    }
}

/**
 * 清理旧数据
 */
async function cleanupOldData() {
    try {
        // 清理过期的分析历史
        const { analysisHistory = [] } = await chrome.storage.local.get('analysisHistory');
        const { maxHistoryEntries = 50 } = await chrome.storage.sync.get('maxHistoryEntries');
        
        if (analysisHistory.length > maxHistoryEntries) {
            const cleanedHistory = analysisHistory
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, maxHistoryEntries);
            
            await chrome.storage.local.set({ analysisHistory: cleanedHistory });
            console.log(`清理了 ${analysisHistory.length - cleanedHistory.length} 条过期记录`);
        }
        
        // 清理过期的临时数据
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const { tempData = {} } = await chrome.storage.local.get('tempData');
        
        const cleanedTempData = {};
        for (const [key, value] of Object.entries(tempData)) {
            if (value.timestamp && value.timestamp > oneWeekAgo) {
                cleanedTempData[key] = value;
            }
        }
        
        await chrome.storage.local.set({ tempData: cleanedTempData });
        
    } catch (error) {
        console.error('清理旧数据失败:', error);
    }
}

/**
 * 检查扩展权限
 */
async function checkExtensionPermissions() {
    const requiredPermissions = {
        permissions: ['activeTab', 'storage', 'scripting'],
        origins: ['https://linux.do/*']
    };
    
    const hasPermissions = await chrome.permissions.contains(requiredPermissions);
    
    return {
        hasAllPermissions: hasPermissions,
        requiredPermissions,
        currentPermissions: await chrome.permissions.getAll()
    };
}

/**
 * 请求额外权限
 */
async function requestAdditionalPermissions(permissions) {
    try {
        const granted = await chrome.permissions.request(permissions);
        return { granted, permissions };
    } catch (error) {
        throw new Error(`权限请求失败: ${error.message}`);
    }
}

/**
 * 注入内容脚本
 */
async function injectContentScript(tabId) {
    try {
        // 检查是否已经注入
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.riskLensContentScript
        });
        
        if (!results[0].result) {
            // 如果没有注入，则注入内容脚本
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
            console.log('内容脚本已注入到标签页:', tabId);
        }
    } catch (error) {
        console.error('注入内容脚本失败:', error);
    }
}

/**
 * 记录分析活动
 */
async function logAnalysisActivity(data) {
    try {
        const { historyEnabled = true } = await chrome.storage.sync.get('historyEnabled');
        
        if (!historyEnabled) {
            return;
        }
        
        const { analysisHistory = [] } = await chrome.storage.local.get('analysisHistory');
        
        const entry = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            username: data.username,
            riskLevel: data.riskLevel,
            riskScore: data.riskScore,
            detectedRisksCount: data.detectedRisks ? data.detectedRisks.length : 0,
            success: data.success !== false
        };
        
        analysisHistory.unshift(entry);
        
        // 限制历史记录数量
        const { maxHistoryEntries = 50 } = await chrome.storage.sync.get('maxHistoryEntries');
        if (analysisHistory.length > maxHistoryEntries) {
            analysisHistory.splice(maxHistoryEntries);
        }
        
        await chrome.storage.local.set({ analysisHistory });
        console.log('分析活动已记录:', entry);
        
    } catch (error) {
        console.error('记录分析活动失败:', error);
    }
}

/**
 * 获取分析历史
 */
async function getAnalysisHistory(options = {}) {
    try {
        const { analysisHistory = [] } = await chrome.storage.local.get('analysisHistory');
        
        let filteredHistory = analysisHistory;
        
        // 按用户名过滤
        if (options.username) {
            filteredHistory = filteredHistory.filter(entry => 
                entry.username.toLowerCase().includes(options.username.toLowerCase())
            );
        }
        
        // 按风险等级过滤
        if (options.riskLevel) {
            filteredHistory = filteredHistory.filter(entry => 
                entry.riskLevel === options.riskLevel
            );
        }
        
        // 按时间范围过滤
        if (options.startDate || options.endDate) {
            filteredHistory = filteredHistory.filter(entry => {
                const entryDate = new Date(entry.timestamp);
                if (options.startDate && entryDate < new Date(options.startDate)) {
                    return false;
                }
                if (options.endDate && entryDate > new Date(options.endDate)) {
                    return false;
                }
                return true;
            });
        }
        
        // 分页
        if (options.limit) {
            const offset = options.offset || 0;
            filteredHistory = filteredHistory.slice(offset, offset + options.limit);
        }
        
        return {
            history: filteredHistory,
            total: analysisHistory.length,
            filtered: filteredHistory.length
        };
        
    } catch (error) {
        throw new Error(`获取分析历史失败: ${error.message}`);
    }
}

/**
 * 工具函数
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;
        
        if (aPart < bPart) return -1;
        if (aPart > bPart) return 1;
    }
    
    return 0;
}

// 错误处理
chrome.runtime.onSuspend.addListener(() => {
    console.log('RiskLens 后台脚本即将暂停');
});

chrome.runtime.onStartup.addListener(() => {
    console.log('RiskLens 后台脚本启动');
});

console.log('RiskLens 后台服务脚本已加载');
