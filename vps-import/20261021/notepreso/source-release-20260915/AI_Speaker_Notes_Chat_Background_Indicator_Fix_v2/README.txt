AI Speaker Notes - Chat Background Processing Indicator Fix v2

This version fixes the Windows PowerShell encoding/parser problem in the first installer.
The installer now delegates to a Python patcher and preserves current HTML/CSS changes.

Apply from the project root:
  powershell -ExecutionPolicy Bypass -File .\AI_Speaker_Notes_Chat_Background_Indicator_Fix_v2\apply-chat-processing-fix.ps1

Then rebuild the app container and hard refresh the browser.
