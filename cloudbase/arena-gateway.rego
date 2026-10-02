package authz.user

default allow := false

# Allow only the dedicated arena gateway path; other resources use platform defaults.
allow if {
 input.subject.auth_type in {"anonymous", "unauthenticated"}
 input.request.path == "/api/arena"
}
allow if {
 input.subject.auth_type in {"anonymous", "unauthenticated"}
 startswith(input.request.path, "/api/arena/")
}
