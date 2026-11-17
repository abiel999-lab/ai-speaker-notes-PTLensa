<#import "footer.ftl" as loginFooter>
<#import "theme-resources.ftl" as themeResourceTags>
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>

<#assign npPresentation = client?? && client.clientId?? && client.clientId == "notepreso-presentation">
<#assign npProduct = "npProductNotes">
<#assign npSubtitle = "npSubtitleNotes">
<#if npPresentation><#assign npProduct = "npProductPresentation"><#assign npSubtitle = "npSubtitlePresentation"></#if>
<#assign npHeroTitle="npHeroNotes"><#assign npHeroBody="npBodyNotes">
<#if npPresentation><#assign npHeroTitle="npHeroPresentation"><#assign npHeroBody="npBodyPresentation"></#if>
<#assign npLoginTitle="npTitleNotes">
<#if npPresentation><#assign npLoginTitle="npTitlePresentation"></#if>
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

    <title>${msg("npWindowTitle")}</title>

    <link rel="icon" type="image/png" href="${url.resourcesPath}/img/notepreso-favicon-v1.png" />

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
    <link rel="stylesheet" href="${url.resourcesPath}/css/notepreso-auth-touch-v1.css" />
</head>

<body class="${properties.kcBodyClass!} ${bodyClass}" data-page-id="login-${pageId}">
<div class="lensa-auth">
<aside class="lensa-auth__brand" aria-label="NotePreso"><div class="np-wordmark"><img src="${url.resourcesPath}/img/notepreso-brand-v1.png" alt="NotePreso" /></div><div class="np-brand-copy"><p class="np-product">${msg(npProduct)}</p><h2>${msg(npHeroTitle)}</h2><p>${msg(npHeroBody)}</p></div></aside>

    <main class="lensa-auth__main"><div class="np-mobile-brand"><div class="np-wordmark"><img src="${url.resourcesPath}/img/notepreso-brand-v1.png" alt="NotePreso" /></div><p class="np-product">${msg(npProduct)}</p></div>


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


                <#if !(auth?has_content && auth.showUsername() && !auth.showResetCredentials())>
                    <#if displayRequiredFields>
                        <div class="lensa-auth__required"><span class="required">*</span> ${msg("requiredFields")}</div>
                    </#if>
                    <h1 id="kc-page-title"><#if pageId == "login.ftl" || pageId == "login">${msg(npLoginTitle)}<#else><#nested "header"></#if></h1>
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

                <#if pageId == "login.ftl" || pageId == "login"><p class="lensa-auth__subtitle">${msg(npSubtitle)}</p></#if>
            </header>

            <#if pageId == "register" || pageId == "register.ftl">
                <#if social?? && social.providers?? && social.providers?has_content>
                    <div class="np-signup-social" aria-label="${(lang?starts_with("id"))?then("Pilihan pendaftaran","Sign-up options")}">
                        <#list social.providers as provider>
                            <#if provider.alias == "google">
                                <a id="np-signup-google" href="${provider.loginUrl}" data-once-link data-disabled-class="np-auth-disabled"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4ZM12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3v2.6A10 10 0 0 0 12 22ZM6.4 13.9a6 6 0 0 1 0-3.8V7.5H3a10 10 0 0 0 0 9l3.4-2.6ZM12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.6C7.2 7.7 9.4 5.9 12 5.9Z"/></svg><span>${(lang?starts_with("id"))?then("Lanjutkan dengan Google","Continue with Google")}</span></a>
                            </#if>
                        </#list>
                    </div>
                    <div class="np-signup-divider"><span>${(lang?starts_with("id"))?then("Atau buat akun dengan email","Or create an account with email")}</span></div>
                </#if>
            </#if>
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
                <#if pageId == "register" || pageId == "register.ftl">
                    <p class="np-signup-policy">${(lang?starts_with("id"))?then("Dengan membuat akun, Anda menyetujui","By creating an account, you agree to the")} <a href="https://notepreso.com/terms" target="_blank" rel="noopener">${(lang?starts_with("id"))?then("Ketentuan Penggunaan","Terms of Use")}</a> ${(lang?starts_with("id"))?then("dan memahami","and acknowledge the")} <a href="https://notepreso.com/privacy" target="_blank" rel="noopener">${(lang?starts_with("id"))?then("Pemberitahuan Privasi","Privacy Notice")}</a>.</p>
                </#if>
                <@loginFooter.content/>

            </footer>
        </section>
    </main>
</div>
<script type="module" src="${url.resourcesPath}/js/lensa-password-toggle.js"></script>
<#if pageId == "register" || pageId == "register.ftl"><script src="${url.resourcesPath}/js/notepreso-signup-phase05c.js" defer></script></#if>
</body>
</html>
</#macro>
