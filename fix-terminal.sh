#!/usr/bin/env zsh

# Fix Terminal Script for Cline
# Цей скрипт допомагає стабілізувати роботу терміналу з Cline

# Перевіряємо чи працює zsh
if [ "$SHELL" != "/usr/bin/zsh" ]; then
    echo "Switching to zsh..."
    export SHELL=/usr/bin/zsh
    exec /usr/bin/zsh -l
fi

# Встановлюємо правильні змінні середовища
export SHELL=/usr/bin/zsh
export TERM=xterm-256color
export ZSH_DISABLE_COMPFIX=true

# Перевіряємо Oh My Zsh
if [ -d "$HOME/.oh-my-zsh" ]; then
    export ZSH="$HOME/.oh-my-zsh"
fi

# Показуємо інформацію про поточний стан
echo "=== Terminal Status ==="
echo "Shell: $SHELL"
echo "Term: $TERM"
echo "User: $(whoami)"
echo "PWD: $(pwd)"
echo "ZSH Version: $(zsh --version)"
echo "======================="

# Якщо передано команду як аргумент, виконуємо її
if [ $# -gt 0 ]; then
    echo "Executing: $@"
    eval "$@"
fi
