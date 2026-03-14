package core

import (
	"errors"
	"fmt"
)

// Sentinel errors for the SWE platform.
var (
	ErrProjectNotFound  = errors.New("project not found")
	ErrAgentNotFound    = errors.New("agent not found")
	ErrWorkItemNotFound = errors.New("work item not found")
	ErrArtifactNotFound      = errors.New("artifact not found")
	ErrNotificationNotFound = errors.New("notification not found")
	ErrInvalidState          = errors.New("invalid state transition")
	ErrPermissionDenied = errors.New("permission denied")
)

// Error wraps platform errors with context.
type Error struct {
	Kind    ErrorKind
	Message string
	Err     error
}

// ErrorKind categorizes errors for HTTP status mapping.
type ErrorKind int

const (
	ErrKindInternal ErrorKind = iota
	ErrKindNotFound
	ErrKindBadRequest
	ErrKindPermission
	ErrKindConfig
	ErrKindTimeout
)

func (e *Error) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *Error) Unwrap() error {
	return e.Err
}

// NewError creates a new platform error.
func NewError(kind ErrorKind, msg string, err error) *Error {
	return &Error{Kind: kind, Message: msg, Err: err}
}

// ConfigError creates a configuration error.
func ConfigError(msg string) *Error {
	return &Error{Kind: ErrKindConfig, Message: msg}
}

// InternalError creates an internal error.
func InternalError(msg string, err error) *Error {
	return &Error{Kind: ErrKindInternal, Message: msg, Err: err}
}

// NotFoundError creates a not-found error.
func NotFoundError(msg string) *Error {
	return &Error{Kind: ErrKindNotFound, Message: msg}
}
