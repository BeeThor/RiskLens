// 内容脚本 - 在linux.do页面中执行

(function() {
    'use strict';
    
    // 避免重复注入
    if (window.riskLensContentScript) {
        return;
    }
    window.riskLensContentScript = true;
    
    console.log('RiskLens 风险透镜内容脚本已加载');
    
    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getUserActions') {
            // 使用安全的用户行为获取方法
            getUserActionsSecure(request.username, request.offset)
                .then(sendResponse)
                .catch(error => sendResponse({ error: error.message }));
            return true; // 保持消息通道开放
        }
        
        if (request.action === 'checkSite') {
            // 异步获取完整用户信息
            (async () => {
                try {
                    const currentUser = getCurrentUser();
                    const sessionUser = await getCurrentUserSession();
                    
                    // 合并用户信息，优先使用会话信息
                    const mergedUser = sessionUser || currentUser;
                    
                    sendResponse({
                        isLinuxDo: window.location.hostname === 'linux.do',
                        currentUrl: window.location.href,
                        currentUser: mergedUser,
                        isLoggedIn: !!mergedUser,
                        canAnalyze: !!mergedUser && window.location.hostname === 'linux.do'
                    });
                } catch (error) {
                    sendResponse({
                        isLinuxDo: window.location.hostname === 'linux.do',
                        currentUrl: window.location.href,
                        currentUser: null,
                        isLoggedIn: false,
                        canAnalyze: false,
                        error: error.message
                    });
                }
            })();
            return true; // 保持异步消息通道开放
        }
    });
    
    /**
     * 获取用户活动数据（安全版本）
     */
    async function getUserActionsSecure(requestedUsername, offset = 0) {
        try {
            // 获取当前用户信息
            let currentUser = getCurrentUser();
            
            // 如果从DOM获取失败，尝试通过API获取
            if (!currentUser) {
                currentUser = await getCurrentUserSession();
            }
            
            // 验证用户权限
            validateUserAccess(requestedUsername, currentUser);
            
            // 记录访问日志
            console.log(`[RiskLens Security] 用户 ${currentUser.username} 正在分析自己的数据`);
            
            // 调用原始数据获取函数
            return await getUserActions(requestedUsername, offset);
            
        } catch (error) {
            console.error('[RiskLens Security] 安全验证失败:', error);
            throw error;
        }
    }
    
    /**
     * 获取用户活动数据（内部函数）
     */
    async function getUserActions(username, offset = 0) {
        try {
            const url = `/user_actions.json?offset=${offset}&username=${username}&filter=4,5`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Discourse-Present': 'true'
                },
                credentials: 'same-origin'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 添加安全元数据
            return { 
                data,
                security: {
                    accessTime: new Date().toISOString(),
                    username: username,
                    offset: offset
                }
            };
            
        } catch (error) {
            console.error('获取用户活动失败:', error);
            throw error;
        }
    }
    
    /**
     * 获取当前登录用户信息（安全版本）
     */
    function getCurrentUser() {
        try {
            // 方法1: 从用户头像按钮获取信息（最可靠）
            const userButton = document.querySelector('#toggle-current-user img');
            if (userButton && userButton.src) {
                const avatarSrc = userButton.src;
                // 从头像URL提取用户名: /user_avatar/linux.do/beethor/96/951769_2.png
                const usernameMatch = avatarSrc.match(/\/user_avatar\/linux\.do\/([^\/]+)\//);
                if (usernameMatch) {
                    return {
                        username: usernameMatch[1],
                        avatarUrl: avatarSrc,
                        method: 'avatar_button'
                    };
                }
            }
            
            // 方法2: 从页面元素获取（备用）
            const userElement = document.querySelector('[data-user-card]');
            if (userElement) {
                const username = userElement.getAttribute('data-user-card');
                return {
                    username: username,
                    method: 'data_attribute'
                };
            }
            
            // 方法3: 从导航栏获取（备用）
            const navUser = document.querySelector('.header-dropdown-toggle .avatar');
            if (navUser && navUser.title) {
                return {
                    username: navUser.title,
                    method: 'nav_avatar'
                };
            }
            
            return null;
        } catch (error) {
            console.error('获取当前用户失败:', error);
            return null;
        }
    }
    
    /**
     * 异步获取用户会话信息
     */
    async function getCurrentUserSession() {
        try {
            const response = await fetch('/session/current.json', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Discourse-Present': 'true'
                },
                credentials: 'same-origin'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.current_user) {
                    return {
                        id: data.current_user.id,
                        username: data.current_user.username,
                        name: data.current_user.name,
                        avatarTemplate: data.current_user.avatar_template,
                        method: 'session_api'
                    };
                }
            }
        } catch (error) {
            console.error('获取会话信息失败:', error);
        }
        return null;
    }
    
    /**
     * 验证用户是否有权限访问指定用户数据
     */
    function validateUserAccess(requestedUsername, currentUser) {
        if (!currentUser || !currentUser.username) {
            throw new Error('未登录或无法获取用户信息');
        }
        
        if (!requestedUsername) {
            throw new Error('未指定要分析的用户名');
        }
        
        // 只允许用户访问自己的数据（不区分大小写）
        if (currentUser.username.toLowerCase() !== requestedUsername.toLowerCase()) {
            throw new Error(`安全限制：只能分析自己的数据。当前用户: ${currentUser.username}, 请求用户: ${requestedUsername}`);
        }
        
        return true;
    }
    
    /**
     * 检查页面状态
     */
    function checkPageStatus() {
        return {
            isLoggedIn: !!document.querySelector('[data-user-card]'),
            currentPage: window.location.pathname,
            isUserPage: /\/u\/[^\/]+/.test(window.location.pathname),
            canAnalyze: window.location.hostname === 'linux.do'
        };
    }
    
    /**
     * 添加页面指示器（可选功能）
     */
    function addPageIndicator() {
        // 检查是否已添加
        if (document.querySelector('#risklens-indicator')) {
            return;
        }
        
        // 创建指示器
        const indicator = document.createElement('div');
        indicator.id = 'risklens-indicator';
        indicator.className = 'risklens-indicator';
        indicator.innerHTML = `
            <i class="fas fa-shield-alt" style="color: #3498db;"></i>
            <span>RiskLens 已启用</span>
        `;
        
        document.body.appendChild(indicator);
        
        // 点击指示器打开分析页面
        indicator.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'openDashboard' });
        });
        
        // 3秒后自动隐藏
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.style.opacity = '0';
                setTimeout(() => {
                    if (indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }
                }, 200);
            }
        }, 3000);
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    function initialize() {
        console.log('RiskLens 内容脚本初始化完成');
        
        // 只在linux.do域名下添加指示器
        if (window.location.hostname === 'linux.do') {
            // 延迟添加指示器，确保页面完全加载
            setTimeout(addPageIndicator, 1000);
        }
    }
    
    // 导出函数供popup使用
    window.riskLensAPI = {
        getUserActionsSecure,
        getCurrentUser,
        getCurrentUserSession,
        checkPageStatus,
        validateUserAccess
    };
    
})();
