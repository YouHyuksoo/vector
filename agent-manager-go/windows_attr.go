//go:build windows

package main

import "syscall"

func windowsHideAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true}
}
