# Changelog


## v0.1.3

[compare changes](https://github.com/danlourenco/reposync/compare/v0.1.2...v0.1.3)

### 🚀 Enhancements

- **Rule-Based File Augmentation System**: Implement flexible augmentation engine for preserving and updating files
  - **Augmentation Engine**: Process files based on configurable rules with conditions and actions
  - **Condition Evaluator**: Support for `yaml_has_key`, `json_has_key`, and `value_matches` conditions
  - **Action Handler**: Implement `update_version_in_value`, `replace_value`, and `append_to_array` actions
  - **Rule Loader**: Load rules from multiple sources (global, project, main config, env)
  - **External Configuration**: Support for company-specific rules outside the public repository

### ✅ Tests

- Add comprehensive test suite for augmentation system (56 tests passing)
- Fix all test failures with proper mock configuration
- Ensure 100% test coverage for augmentation components

### 🐛 Bug Fixes

- Fix test mock setup for rule loader with proper config source handling
- Fix test timeouts by ensuring 2-second limit on all tests

### 📚 Documentation

- Add comprehensive augmentation system documentation
- Add example rules configuration file (rules.example.yaml)
- Document all supported conditions and actions
- Include best practices and security considerations

## v0.1.2

[compare changes](https://github.com/danlourenco/test-reposync/compare/v0.1.1...v0.1.2)

### 🚀 Enhancements

- **UnJS Utilities Integration**: Replace custom implementations with robust UnJS libraries
  - **URL Utils with `ufo`**: Enhanced URL parsing and manipulation with enterprise GitHub support
  - **JSON Utils with `destr`**: Safe JSON parsing with comment support and graceful error handling  
  - **Rate Limiting with `perfect-debounce`**: Advanced API call debouncing and request queuing

### 📦 Dependencies

- Add `ufo@1.5.4` for modern URL utilities
- Add `destr@2.0.3` for safe JSON parsing
- Add `perfect-debounce@1.0.0` for advanced debouncing

## v0.1.1

[compare changes](https://github.com/danlourenco/test-reposync/compare/v0.1.0...v0.1.1)

### ✅ Tests

- Add comprehensive tests for UnJS utilities optimization (142 tests passing)
- Add URL manipulation tests with enterprise GitHub support
- Add JSON parsing tests with edge case handling
- Add rate limiting tests with debouncing and queuing

### ❤️ Contributors

- Dan Lourenco <danlourenco@gmail.com>

