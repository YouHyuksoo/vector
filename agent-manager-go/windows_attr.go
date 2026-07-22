//go:build windows

package main

import "syscall"

func windowsHideAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true}
}

// fileDevInode 는 Vector의 fingerprint.strategy = "device_and_inode" 와 같은
// [VolumeSerialNumber, FileIndex] 쌍을 구한다. os.Stat 으로는 얻을 수 없다.
func fileDevInode(path string) ([2]uint64, bool) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return [2]uint64{}, false
	}
	// 권한 0 = 메타데이터 조회만. 설비가 쓰는 중인 파일도 방해하지 않는다.
	h, err := syscall.CreateFile(p, 0,
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE,
		nil, syscall.OPEN_EXISTING, syscall.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		return [2]uint64{}, false
	}
	defer syscall.CloseHandle(h)

	var info syscall.ByHandleFileInformation
	if err := syscall.GetFileInformationByHandle(h, &info); err != nil {
		return [2]uint64{}, false
	}
	return [2]uint64{
		uint64(info.VolumeSerialNumber),
		uint64(info.FileIndexHigh)<<32 | uint64(info.FileIndexLow),
	}, true
}
