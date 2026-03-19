Output demo.gif

Set FontSize 40
Set FontFamily "Monoflow"
Set Width 1200
Set Height 600
Set TypingSpeed 60ms
Set Theme "Dracula"
Set WindowBar Colorful
Set Framerate 60

# Hide the setup so the GIF starts clean
Hide
Type "clear"
Enter
Show

Sleep 500ms
Type "pnpm dlx convexdoc init"
Sleep 300ms
Enter
Sleep 3s

Sleep 1s
Type "pnpm dlx convexdoc generate"
Sleep 300ms
Enter
Sleep 3s

Sleep 1s
Type "pnpm dlx convexdoc serve"
Sleep 300ms
Enter
Sleep 2s