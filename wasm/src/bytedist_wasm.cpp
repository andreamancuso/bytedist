#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <utility>
#include <variant>
#include <vector>

namespace {

constexpr uint8_t payload_magic[] = {'B', 'D', 'I', 'S', 'T', 'P', 'A', 'Y'};
constexpr uint8_t footer_magic[] = {'B', 'D', 'I', 'S', 'T', 'E', 'N', 'D'};
constexpr uint32_t payload_format_version = 0;
constexpr uint32_t payload_header_length = 24;
constexpr uint32_t payload_footer_length = 40;

enum ErrorCode : int32_t {
  ok = 0,
  format_error = 1,
  version_error = 2,
  integrity_error = 3,
  not_found_error = 4,
  compression_error = 5
};

struct JsonValue;
using JsonArray = std::vector<JsonValue>;
using JsonObject = std::map<std::string, JsonValue>;

struct JsonValue {
  using Value = std::variant<std::nullptr_t, bool, double, std::string, JsonArray, JsonObject>;
  Value value;
};

struct Chunk {
  std::string name;
  uint64_t offset = 0;
  uint64_t length = 0;
  uint64_t stored_length = 0;
  std::string compression;
};

struct Archive {
  std::vector<uint8_t> bytes;
  std::string toc_json;
  std::vector<Chunk> chunks;
  std::vector<uint8_t> result;
};

std::map<int32_t, std::unique_ptr<Archive>> archives;
int32_t next_handle = 1;
ErrorCode last_error_code = ok;
std::string last_error_message;

void set_error(ErrorCode code, std::string message) {
  last_error_code = code;
  last_error_message = std::move(message);
}

void clear_error() {
  last_error_code = ok;
  last_error_message.clear();
}

bool has_magic(const std::vector<uint8_t>& bytes, size_t offset, const uint8_t* magic) {
  if (offset + 8 > bytes.size()) {
    return false;
  }

  for (size_t index = 0; index < 8; index += 1) {
    if (bytes[offset + index] != magic[index]) {
      return false;
    }
  }

  return true;
}

uint32_t read_u32(const std::vector<uint8_t>& bytes, size_t offset) {
  return static_cast<uint32_t>(bytes[offset]) | (static_cast<uint32_t>(bytes[offset + 1]) << 8) |
         (static_cast<uint32_t>(bytes[offset + 2]) << 16) |
         (static_cast<uint32_t>(bytes[offset + 3]) << 24);
}

uint64_t read_u64(const std::vector<uint8_t>& bytes, size_t offset) {
  uint64_t value = 0;
  for (size_t index = 0; index < 8; index += 1) {
    value |= static_cast<uint64_t>(bytes[offset + index]) << (index * 8);
  }
  return value;
}

uint32_t crc32(const uint8_t* data, size_t length) {
  uint32_t crc = 0xffffffffU;

  for (size_t index = 0; index < length; index += 1) {
    crc ^= data[index];
    for (int bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1U) != 0U ? (0xedb88320U ^ (crc >> 1U)) : (crc >> 1U);
    }
  }

  return crc ^ 0xffffffffU;
}

class JsonParser {
 public:
  explicit JsonParser(std::string_view input) : input_(input) {}

  std::optional<JsonValue> parse() {
    auto value = parse_value();
    skip_ws();

    if (!value.has_value() || position_ != input_.size()) {
      return std::nullopt;
    }

    return value;
  }

 private:
  std::string_view input_;
  size_t position_ = 0;

  void skip_ws() {
    while (position_ < input_.size() &&
           (input_[position_] == ' ' || input_[position_] == '\n' || input_[position_] == '\r' ||
            input_[position_] == '\t')) {
      position_ += 1;
    }
  }

  bool consume(char expected) {
    skip_ws();
    if (position_ >= input_.size() || input_[position_] != expected) {
      return false;
    }
    position_ += 1;
    return true;
  }

  std::optional<JsonValue> parse_value() {
    skip_ws();
    if (position_ >= input_.size()) {
      return std::nullopt;
    }

    const char current = input_[position_];
    if (current == '{') {
      return parse_object();
    }
    if (current == '[') {
      return parse_array();
    }
    if (current == '"') {
      auto text = parse_string();
      if (!text.has_value()) {
        return std::nullopt;
      }
      return JsonValue{*text};
    }
    if (current == 't' && consume_literal("true")) {
      return JsonValue{true};
    }
    if (current == 'f' && consume_literal("false")) {
      return JsonValue{false};
    }
    if (current == 'n' && consume_literal("null")) {
      return JsonValue{nullptr};
    }
    if (current == '-' || std::isdigit(static_cast<unsigned char>(current)) != 0) {
      return parse_number();
    }

    return std::nullopt;
  }

  bool consume_literal(std::string_view literal) {
    if (input_.substr(position_, literal.size()) != literal) {
      return false;
    }
    position_ += literal.size();
    return true;
  }

  std::optional<JsonValue> parse_object() {
    if (!consume('{')) {
      return std::nullopt;
    }

    JsonObject object;
    skip_ws();
    if (consume('}')) {
      return JsonValue{object};
    }

    while (true) {
      auto key = parse_string();
      if (!key.has_value() || !consume(':')) {
        return std::nullopt;
      }

      auto value = parse_value();
      if (!value.has_value()) {
        return std::nullopt;
      }

      object[*key] = *value;

      if (consume('}')) {
        return JsonValue{object};
      }
      if (!consume(',')) {
        return std::nullopt;
      }
    }
  }

  std::optional<JsonValue> parse_array() {
    if (!consume('[')) {
      return std::nullopt;
    }

    JsonArray array;
    skip_ws();
    if (consume(']')) {
      return JsonValue{array};
    }

    while (true) {
      auto value = parse_value();
      if (!value.has_value()) {
        return std::nullopt;
      }

      array.push_back(*value);

      if (consume(']')) {
        return JsonValue{array};
      }
      if (!consume(',')) {
        return std::nullopt;
      }
    }
  }

  std::optional<JsonValue> parse_number() {
    const size_t start = position_;
    if (input_[position_] == '-') {
      position_ += 1;
    }

    if (position_ >= input_.size()) {
      return std::nullopt;
    }

    if (input_[position_] == '0') {
      position_ += 1;
    } else if (std::isdigit(static_cast<unsigned char>(input_[position_])) != 0) {
      while (position_ < input_.size() &&
             std::isdigit(static_cast<unsigned char>(input_[position_])) != 0) {
        position_ += 1;
      }
    } else {
      return std::nullopt;
    }

    if (position_ < input_.size() && input_[position_] == '.') {
      position_ += 1;
      if (position_ >= input_.size() ||
          std::isdigit(static_cast<unsigned char>(input_[position_])) == 0) {
        return std::nullopt;
      }
      while (position_ < input_.size() &&
             std::isdigit(static_cast<unsigned char>(input_[position_])) != 0) {
        position_ += 1;
      }
    }

    if (position_ < input_.size() && (input_[position_] == 'e' || input_[position_] == 'E')) {
      position_ += 1;
      if (position_ < input_.size() && (input_[position_] == '+' || input_[position_] == '-')) {
        position_ += 1;
      }
      if (position_ >= input_.size() ||
          std::isdigit(static_cast<unsigned char>(input_[position_])) == 0) {
        return std::nullopt;
      }
      while (position_ < input_.size() &&
             std::isdigit(static_cast<unsigned char>(input_[position_])) != 0) {
        position_ += 1;
      }
    }

    const std::string number(input_.substr(start, position_ - start));
    char* end = nullptr;
    const double parsed = std::strtod(number.c_str(), &end);
    if (end == nullptr || *end != '\0') {
      return std::nullopt;
    }

    return JsonValue{parsed};
  }

  std::optional<std::string> parse_string() {
    skip_ws();
    if (position_ >= input_.size() || input_[position_] != '"') {
      return std::nullopt;
    }
    position_ += 1;

    std::string output;
    while (position_ < input_.size()) {
      const char current = input_[position_++];
      if (current == '"') {
        return output;
      }

      if (static_cast<unsigned char>(current) < 0x20U) {
        return std::nullopt;
      }

      if (current != '\\') {
        output.push_back(current);
        continue;
      }

      if (position_ >= input_.size()) {
        return std::nullopt;
      }

      const char escape = input_[position_++];
      switch (escape) {
        case '"':
        case '\\':
        case '/':
          output.push_back(escape);
          break;
        case 'b':
          output.push_back('\b');
          break;
        case 'f':
          output.push_back('\f');
          break;
        case 'n':
          output.push_back('\n');
          break;
        case 'r':
          output.push_back('\r');
          break;
        case 't':
          output.push_back('\t');
          break;
        case 'u': {
          auto code_point = parse_hex4();
          if (!code_point.has_value()) {
            return std::nullopt;
          }
          append_utf8(output, *code_point);
          break;
        }
        default:
          return std::nullopt;
      }
    }

    return std::nullopt;
  }

  std::optional<uint32_t> parse_hex4() {
    if (position_ + 4 > input_.size()) {
      return std::nullopt;
    }

    uint32_t value = 0;
    for (int index = 0; index < 4; index += 1) {
      const char c = input_[position_++];
      value <<= 4U;
      if (c >= '0' && c <= '9') {
        value |= static_cast<uint32_t>(c - '0');
      } else if (c >= 'a' && c <= 'f') {
        value |= static_cast<uint32_t>(10 + c - 'a');
      } else if (c >= 'A' && c <= 'F') {
        value |= static_cast<uint32_t>(10 + c - 'A');
      } else {
        return std::nullopt;
      }
    }

    return value;
  }

  static void append_utf8(std::string& output, uint32_t code_point) {
    if (code_point <= 0x7FU) {
      output.push_back(static_cast<char>(code_point));
    } else if (code_point <= 0x7FFU) {
      output.push_back(static_cast<char>(0xC0U | (code_point >> 6U)));
      output.push_back(static_cast<char>(0x80U | (code_point & 0x3FU)));
    } else {
      output.push_back(static_cast<char>(0xE0U | (code_point >> 12U)));
      output.push_back(static_cast<char>(0x80U | ((code_point >> 6U) & 0x3FU)));
      output.push_back(static_cast<char>(0x80U | (code_point & 0x3FU)));
    }
  }
};

const JsonObject* as_object(const JsonValue& value) {
  return std::get_if<JsonObject>(&value.value);
}

const JsonArray* as_array(const JsonValue& value) {
  return std::get_if<JsonArray>(&value.value);
}

const std::string* get_string(const JsonObject& object, const char* key) {
  const auto found = object.find(key);
  if (found == object.end()) {
    return nullptr;
  }
  return std::get_if<std::string>(&found->second.value);
}

std::optional<uint64_t> get_u64(const JsonObject& object, const char* key) {
  const auto found = object.find(key);
  if (found == object.end()) {
    return std::nullopt;
  }

  const auto* number = std::get_if<double>(&found->second.value);
  if (number == nullptr || *number < 0 || *number > 9007199254740991.0 ||
      std::floor(*number) != *number) {
    return std::nullopt;
  }

  return static_cast<uint64_t>(*number);
}

bool is_alpha_ascii(char value) {
  return (value >= 'A' && value <= 'Z') || (value >= 'a' && value <= 'z');
}

bool is_valid_chunk_name(const std::string& name) {
  if (name.empty() || name.front() == '/' || name.back() == '/') {
    return false;
  }

  if (name.find('\0') != std::string::npos || name.find('\\') != std::string::npos) {
    return false;
  }

  if (name.size() >= 2 && is_alpha_ascii(name[0]) && name[1] == ':') {
    return false;
  }

  size_t start = 0;
  while (start <= name.size()) {
    const size_t slash = name.find('/', start);
    const size_t end = slash == std::string::npos ? name.size() : slash;
    const std::string segment = name.substr(start, end - start);
    if (segment.empty() || segment == "..") {
      return false;
    }
    if (slash == std::string::npos) {
      break;
    }
    start = slash + 1;
  }

  return true;
}

bool parse_archive(std::unique_ptr<Archive> archive, int32_t& handle) {
  const auto& bytes = archive->bytes;
  if (bytes.size() < payload_header_length + payload_footer_length) {
    set_error(format_error, "ByteDist payload is too short to contain a header and footer.");
    return false;
  }

  if (!has_magic(bytes, 0, payload_magic)) {
    set_error(format_error, "Invalid ByteDist payload magic bytes.");
    return false;
  }

  if (read_u32(bytes, 8) != payload_format_version) {
    set_error(version_error, "Unsupported ByteDist payload format version.");
    return false;
  }

  if (read_u32(bytes, 12) != payload_header_length) {
    set_error(format_error, "Invalid ByteDist header length.");
    return false;
  }

  if (read_u32(bytes, 16) != 0 || read_u32(bytes, 20) != 0) {
    set_error(format_error, "Unsupported ByteDist header flags or reserved fields.");
    return false;
  }

  const size_t footer_offset = bytes.size() - payload_footer_length;
  if (!has_magic(bytes, footer_offset, footer_magic)) {
    set_error(format_error, "Invalid ByteDist footer magic bytes.");
    return false;
  }

  if (read_u32(bytes, footer_offset + 8) != payload_format_version) {
    set_error(version_error, "Unsupported ByteDist footer format version.");
    return false;
  }

  const uint64_t toc_offset = read_u64(bytes, footer_offset + 12);
  const uint64_t toc_length = read_u64(bytes, footer_offset + 20);
  const uint64_t payload_length = read_u64(bytes, footer_offset + 28);
  const uint32_t toc_checksum = read_u32(bytes, footer_offset + 36);

  if (payload_length != bytes.size()) {
    set_error(format_error, "ByteDist footer payload length does not match actual length.");
    return false;
  }

  if (toc_offset < payload_header_length || toc_length == 0 || toc_offset > footer_offset ||
      toc_length > footer_offset - toc_offset) {
    set_error(format_error, "ByteDist TOC range is outside the payload data region.");
    return false;
  }

  const uint8_t* toc_data = bytes.data() + toc_offset;
  if (crc32(toc_data, static_cast<size_t>(toc_length)) != toc_checksum) {
    set_error(integrity_error, "ByteDist TOC CRC32 mismatch.");
    return false;
  }

  const std::string toc_json(reinterpret_cast<const char*>(toc_data), static_cast<size_t>(toc_length));
  archive->toc_json = toc_json;
  JsonParser parser(toc_json);
  auto parsed = parser.parse();
  if (!parsed.has_value()) {
    set_error(format_error, "ByteDist TOC is not valid JSON.");
    return false;
  }

  const JsonObject* toc = as_object(*parsed);
  if (toc == nullptr) {
    set_error(format_error, "ByteDist TOC must be an object.");
    return false;
  }

  auto toc_version = get_u64(*toc, "version");
  if (!toc_version.has_value() || *toc_version != payload_format_version) {
    set_error(format_error, "ByteDist TOC has an unsupported version.");
    return false;
  }

  const auto* toc_encoding = get_string(*toc, "tocEncoding");
  if (toc_encoding == nullptr || *toc_encoding != "json") {
    set_error(format_error, "ByteDist TOC has an unsupported encoding.");
    return false;
  }

  const auto chunks_found = toc->find("chunks");
  if (chunks_found == toc->end()) {
    set_error(format_error, "ByteDist TOC chunks must be an array.");
    return false;
  }

  const JsonArray* chunks = as_array(chunks_found->second);
  if (chunks == nullptr) {
    set_error(format_error, "ByteDist TOC chunks must be an array.");
    return false;
  }

  std::set<std::string> seen_names;
  for (const auto& chunk_value : *chunks) {
    const JsonObject* chunk_object = as_object(chunk_value);
    if (chunk_object == nullptr) {
      set_error(format_error, "ByteDist TOC chunk must be an object.");
      return false;
    }

    const auto* name = get_string(*chunk_object, "name");
    const auto offset = get_u64(*chunk_object, "offset");
    const auto length = get_u64(*chunk_object, "length");
    const auto stored_length = get_u64(*chunk_object, "storedLength");
    const auto* compression = get_string(*chunk_object, "compression");

    if (name == nullptr || !offset.has_value() || !length.has_value() ||
        !stored_length.has_value() || compression == nullptr) {
      set_error(format_error, "ByteDist TOC chunk has invalid required fields.");
      return false;
    }

    if (!is_valid_chunk_name(*name)) {
      set_error(format_error, "Invalid ByteDist chunk name.");
      return false;
    }

    if (!seen_names.insert(*name).second) {
      set_error(format_error, "Duplicate ByteDist chunk name in TOC.");
      return false;
    }

    if (*compression == "none" && *stored_length != *length) {
      set_error(compression_error, "ByteDist chunk has different stored and logical lengths without compression.");
      return false;
    }

    if (*offset < payload_header_length || *offset > toc_offset ||
        *stored_length > toc_offset - *offset) {
      set_error(format_error, "ByteDist chunk points outside the chunk data region.");
      return false;
    }

    archive->chunks.push_back(Chunk{*name, *offset, *length, *stored_length, *compression});
  }

  handle = next_handle++;
  archives[handle] = std::move(archive);
  clear_error();
  return true;
}

Archive* get_archive(int32_t handle) {
  const auto found = archives.find(handle);
  if (found == archives.end()) {
    set_error(format_error, "Invalid ByteDist WASM archive handle.");
    return nullptr;
  }
  return found->second.get();
}

}  // namespace

extern "C" {

void* bd_malloc(int32_t length) {
  if (length < 0) {
    return nullptr;
  }
  return std::malloc(static_cast<size_t>(length));
}

void bd_free(void* pointer) {
  std::free(pointer);
}

int32_t bd_open(const uint8_t* pointer, int32_t length) {
  if (pointer == nullptr || length < 0) {
    set_error(format_error, "Invalid ByteDist payload input.");
    return 0;
  }

  auto archive = std::make_unique<Archive>();
  archive->bytes.assign(pointer, pointer + length);

  int32_t handle = 0;
  return parse_archive(std::move(archive), handle) ? handle : 0;
}

void bd_close(int32_t handle) {
  archives.erase(handle);
}

int32_t bd_chunk_count(int32_t handle) {
  const Archive* archive = get_archive(handle);
  return archive == nullptr ? -1 : static_cast<int32_t>(archive->chunks.size());
}

const uint8_t* bd_toc_json_ptr(int32_t handle) {
  const Archive* archive = get_archive(handle);
  if (archive == nullptr || archive->toc_json.empty()) {
    return nullptr;
  }
  return reinterpret_cast<const uint8_t*>(archive->toc_json.data());
}

int32_t bd_toc_json_len(int32_t handle) {
  const Archive* archive = get_archive(handle);
  return archive == nullptr ? -1 : static_cast<int32_t>(archive->toc_json.size());
}

const uint8_t* bd_chunk_name_ptr(int32_t handle, int32_t index) {
  const Archive* archive = get_archive(handle);
  if (archive == nullptr || index < 0 || static_cast<size_t>(index) >= archive->chunks.size()) {
    set_error(format_error, "Invalid ByteDist WASM chunk index.");
    return nullptr;
  }
  return reinterpret_cast<const uint8_t*>(archive->chunks[static_cast<size_t>(index)].name.data());
}

int32_t bd_chunk_name_len(int32_t handle, int32_t index) {
  const Archive* archive = get_archive(handle);
  if (archive == nullptr || index < 0 || static_cast<size_t>(index) >= archive->chunks.size()) {
    set_error(format_error, "Invalid ByteDist WASM chunk index.");
    return -1;
  }
  return static_cast<int32_t>(archive->chunks[static_cast<size_t>(index)].name.size());
}

int32_t bd_read_chunk(int32_t handle, const uint8_t* name_pointer, int32_t name_length) {
  Archive* archive = get_archive(handle);
  if (archive == nullptr) {
    return 0;
  }

  if (name_pointer == nullptr || name_length < 0) {
    set_error(format_error, "Invalid ByteDist WASM chunk name input.");
    return 0;
  }

  const std::string name(reinterpret_cast<const char*>(name_pointer), static_cast<size_t>(name_length));
  const auto found = std::find_if(
    archive->chunks.begin(),
    archive->chunks.end(),
    [&](const Chunk& chunk) { return chunk.name == name; }
  );

  if (found == archive->chunks.end()) {
    set_error(not_found_error, "ByteDist payload chunk not found.");
    return 0;
  }

  if (found->compression != "none") {
    set_error(compression_error, "ByteDist WASM reader does not support compressed chunk reads yet.");
    return 0;
  }

  archive->result.assign(
    archive->bytes.begin() + static_cast<std::ptrdiff_t>(found->offset),
    archive->bytes.begin() + static_cast<std::ptrdiff_t>(found->offset + found->stored_length)
  );
  clear_error();
  return 1;
}

const uint8_t* bd_result_ptr(int32_t handle) {
  const Archive* archive = get_archive(handle);
  if (archive == nullptr || archive->result.empty()) {
    return nullptr;
  }
  return archive->result.data();
}

int32_t bd_result_len(int32_t handle) {
  const Archive* archive = get_archive(handle);
  return archive == nullptr ? -1 : static_cast<int32_t>(archive->result.size());
}

int32_t bd_last_error_code() {
  return static_cast<int32_t>(last_error_code);
}

const uint8_t* bd_last_error_message_ptr() {
  return reinterpret_cast<const uint8_t*>(last_error_message.data());
}

int32_t bd_last_error_message_len() {
  return static_cast<int32_t>(last_error_message.size());
}

}
