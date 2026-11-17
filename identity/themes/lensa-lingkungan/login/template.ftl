<#import "footer.ftl" as loginFooter>
<#import "theme-resources.ftl" as themeResourceTags>
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!}" lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>

    <title>${title!}</title>

    <#if themeResources?? && themeResources.favicons?has_content>
        <@themeResourceTags.renderFavicons themeResources.favicons url.resourcesPath />
    <#else>
        <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    </#if>

    <#if themeResources?? && themeResources.stylesCommon?has_content>
        <@themeResourceTags.renderStyles themeResources.stylesCommon url.resourcesCommonPath />
    <#elseif properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>

    <#if themeResources?? && themeResources.styles?has_content>
        <@themeResourceTags.renderStyles themeResources.styles url.resourcesPath />
    <#elseif properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>

    <#if themeResources?? && themeResources.scripts?has_content>
        <@themeResourceTags.renderScripts themeResources.scripts url.resourcesPath "text/javascript" />
    <#elseif properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>

    <script type="importmap">
        {
            "imports": {
                "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
            }
        }
    </script>
    <script src="${url.resourcesPath}/js/menu-button-links.js" type="module"></script>

    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>

    <script type="module">
        <#outputformat "JavaScript">
        import { startSessionPolling } from ${(url.resourcesPath + "/js/authChecker.js")?c};
        startSessionPolling(${url.ssoLoginInOtherTabsUrl?c});
        </#outputformat>
    </script>

    <script type="module">
        document.addEventListener("click", (event) => {
            const link = event.target.closest("a[data-once-link]");
            if (!link) return;
            if (link.getAttribute("aria-disabled") === "true") {
                event.preventDefault();
                return;
            }
            const { disabledClass } = link.dataset;
            if (disabledClass) link.classList.add(...disabledClass.trim().split(/\s+/));
            link.setAttribute("role", "link");
            link.setAttribute("aria-disabled", "true");
        });
    </script>

    <#if authenticationSession??>
        <script type="module">
            <#outputformat "JavaScript">
            import { checkAuthSession } from ${(url.resourcesPath + "/js/authChecker.js")?c};
            checkAuthSession(${authenticationSession.authSessionIdHash?c});
            </#outputformat>
        </script>
    </#if>
</head>

<body class="${properties.kcBodyClass!} ${bodyClass}" data-page-id="login-${pageId}">
<div class="lensa-auth">
    <aside class="lensa-auth__brand" aria-label="Lensa Lingkungan">
        <div class="lensa-auth__brand-top">
            <img class="lensa-auth__logo lensa-auth__logo--light" src="${url.resourcesPath}/img/lensa-lingkungan-logo.png" alt="Lensa Lingkungan" />
        </div>

        <div class="lensa-auth__brand-copy">
            <div class="lensa-auth__eyebrow">ENVIRONMENTAL INTELLIGENCE</div>
            <h2>Satu akses untuk seluruh operasi lingkungan.</h2>
            <p>Kelola proyek, kalkulasi karbon, monitoring IoT, dan akses tim melalui identitas organisasi yang aman.</p>

            <div class="lensa-auth__capabilities" aria-hidden="true">
                <span>Project</span>
                <span>Carbon</span>
                <span>IoT</span>
                <span>Security</span>
            </div>
        </div>

        <div class="lensa-auth__brand-footer">
            <span class="lensa-auth__status-dot"></span>
            Secure workspace · OpenID Connect
        </div>
    </aside>

    <main class="lensa-auth__main">
        <div class="lensa-auth__mobile-brand">
            <img class="lensa-auth__logo" src="${url.resourcesPath}/img/lensa-lingkungan-logo.png" alt="Lensa Lingkungan" />
        </div>

        <div class="lensa-auth__main-top">
            <#if realm.internationalizationEnabled && locale.supported?size gt 1>
                <div id="kc-locale" class="lensa-auth__locale">
                    <div id="kc-locale-wrapper">
                        <div id="kc-locale-dropdown" class="menu-button-links">
                            <button tabindex="1" id="kc-current-locale-link" aria-label="${msg("languages")}" aria-haspopup="true" aria-expanded="false" aria-controls="language-switch1">${locale.current}</button>
                            <ul role="menu" tabindex="-1" aria-labelledby="kc-current-locale-link" id="language-switch1">
                                <#assign i = 1>
                                <#list locale.supported as l>
                                    <li role="none">
                                        <a role="menuitem" id="language-${i}" href="${l.url}">${l.label}</a>
                                    </li>
                                    <#assign i++>
                                </#list>
                            </ul>
                        </div>
                    </div>
                </div>
            </#if>
        </div>

        <section class="lensa-auth__content">
            <header class="lensa-auth__header">
                <div class="lensa-auth__secure-label">SECURE ACCESS</div>

                <#if !(auth?has_content && auth.showUsername() && !auth.showResetCredentials())>
                    <#if displayRequiredFields>
                        <div class="lensa-auth__required"><span class="required">*</span> ${msg("requiredFields")}</div>
                    </#if>
                    <h1 id="kc-page-title"><#nested "header"></h1>
                <#else>
                    <#if displayRequiredFields>
                        <div class="lensa-auth__required"><span class="required">*</span> ${msg("requiredFields")}</div>
                    </#if>
                    <#nested "show-username">
                    <div id="kc-username" class="lensa-auth__attempted-user">
                        <span>${auth.attemptedUsername}</span>
                        <a id="reset-login" href="${url.loginRestartFlowUrl}" aria-label="${msg("restartLoginTooltip")}">${msg("restartLoginTooltip")}</a>
                    </div>
                </#if>

                <p class="lensa-auth__subtitle">${msg("lensaAuthSubtitle")}</p>
            </header>

            <div id="kc-content" class="lensa-auth__body">
                <div id="kc-content-wrapper">
                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="alert-${message.type} ${properties.kcAlertClass!} pf-m-<#if message.type = 'error'>danger<#else>${message.type}</#if>">
                            <div class="pf-c-alert__icon">
                                <#if message.type = 'success'><span class="${properties.kcFeedbackSuccessIcon!}"></span></#if>
                                <#if message.type = 'warning'><span class="${properties.kcFeedbackWarningIcon!}"></span></#if>
                                <#if message.type = 'error'><span class="${properties.kcFeedbackErrorIcon!}"></span></#if>
                                <#if message.type = 'info'><span class="${properties.kcFeedbackInfoIcon!}"></span></#if>
                            </div>
                            <span class="${properties.kcAlertTitleClass!}">${kcSanitize(message.summary)?no_esc}</span>
                        </div>
                    </#if>

                    <#nested "form">

                    <#if auth?has_content && auth.showTryAnotherWayLink()>
                        <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post" class="lensa-auth__secondary-action">
                            <input type="hidden" name="tryAnotherWay" value="on"/>
                            <a href="#" id="try-another-way" onclick="document.forms['kc-select-try-another-way-form'].requestSubmit();return false;">${msg("doTryAnotherWay")}</a>
                        </form>
                    </#if>

                    <#if switchOrganizationEnabled?? && switchOrganizationEnabled>
                        <form id="kc-switch-organization-form" action="${url.loginAction}" method="post" class="lensa-auth__secondary-action">
                            <input type="hidden" name="switchOrganization" value="true"/>
                            <a href="#" id="switch-organization" onclick="document.forms['kc-switch-organization-form'].requestSubmit();return false;">${msg("doSwitchOrganization")}</a>
                        </form>
                    </#if>

                    <#nested "socialProviders">

                    <#if displayInfo>
                        <div id="kc-info" class="lensa-auth__info">
                            <div id="kc-info-wrapper"><#nested "info"></div>
                        </div>
                    </#if>
                </div>
            </div>

            <footer class="lensa-auth__footer">
                <@loginFooter.content/>
                <span>Authentication secured by Keycloak</span>
            </footer>
        </section>
    </main>
</div>
    <script type="module" src="${url.resourcesPath}/js/lensa-password-toggle.js"></script>
</body>
</html>
</#macro>
