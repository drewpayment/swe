package core

// ApiResponse is the standard API response wrapper.
type ApiResponse[T any] struct {
	Success bool    `json:"success"`
	Data    *T      `json:"data,omitempty"`
	Error   *string `json:"error,omitempty"`
}

// SuccessResponse creates a successful response.
func SuccessResponse[T any](data T) ApiResponse[T] {
	return ApiResponse[T]{Success: true, Data: &data}
}

// ErrorResponse creates an error response.
func ErrorResponse[T any](msg string) ApiResponse[T] {
	return ApiResponse[T]{Success: false, Error: &msg}
}
