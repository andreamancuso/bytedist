#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include "../vendor/yyjson/yyjson.h"

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

std::optional<std::string> get_string(yyjson_val* object, const char* key) {
  yyjson_val* value = yyjson_obj_get(object, key);
  if (!yyjson_is_str(value)) {
    return std::nullopt;
  }

  const char* text = yyjson_get_str(value);
  if (text == nullptr) {
    return std::nullopt;
  }

  return std::string(text, yyjson_get_len(value));
}

std::optional<uint64_t> get_u64(yyjson_val* object, const char* key) {
  yyjson_val* value = yyjson_obj_get(object, key);
  if (yyjson_is_uint(value)) {
    const uint64_t number = yyjson_get_uint(value);
    if (number <= 9007199254740991ULL) {
      return number;
    }
    return std::nullopt;
  }

  if (yyjson_is_sint(value)) {
    const int64_t number = yyjson_get_sint(value);
    if (number >= 0 && static_cast<uint64_t>(number) <= 9007199254740991ULL) {
      return static_cast<uint64_t>(number);
    }
    return std::nullopt;
  }

  if (yyjson_is_real(value)) {
    const double number = yyjson_get_real(value);
    if (number >= 0 && number <= 9007199254740991.0 && std::floor(number) == number) {
      return static_cast<uint64_t>(number);
    }
  }

  return std::nullopt;
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
    if (segment.empty() || segment == "." || segment == "..") {
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
  yyjson_doc* doc = yyjson_read(toc_json.data(), toc_json.size(), 0);
  if (doc == nullptr) {
    set_error(format_error, "ByteDist TOC is not valid JSON.");
    return false;
  }

  yyjson_val* toc = yyjson_doc_get_root(doc);
  if (!yyjson_is_obj(toc)) {
    yyjson_doc_free(doc);
    set_error(format_error, "ByteDist TOC must be an object.");
    return false;
  }

  auto toc_version = get_u64(toc, "version");
  if (!toc_version.has_value() || *toc_version != payload_format_version) {
    yyjson_doc_free(doc);
    set_error(format_error, "ByteDist TOC has an unsupported version.");
    return false;
  }

  const auto toc_encoding = get_string(toc, "tocEncoding");
  if (!toc_encoding.has_value() || *toc_encoding != "json") {
    yyjson_doc_free(doc);
    set_error(format_error, "ByteDist TOC has an unsupported encoding.");
    return false;
  }

  yyjson_val* chunks = yyjson_obj_get(toc, "chunks");
  if (!yyjson_is_arr(chunks)) {
    yyjson_doc_free(doc);
    set_error(format_error, "ByteDist TOC chunks must be an array.");
    return false;
  }

  std::set<std::string> seen_names;
  size_t chunk_index = 0;
  size_t chunk_count = 0;
  yyjson_val* chunk_object = nullptr;
  yyjson_arr_foreach(chunks, chunk_index, chunk_count, chunk_object) {
    if (!yyjson_is_obj(chunk_object)) {
      yyjson_doc_free(doc);
      set_error(format_error, "ByteDist TOC chunk must be an object.");
      return false;
    }

    const auto name = get_string(chunk_object, "name");
    const auto offset = get_u64(chunk_object, "offset");
    const auto length = get_u64(chunk_object, "length");
    const auto stored_length = get_u64(chunk_object, "storedLength");
    const auto compression = get_string(chunk_object, "compression");

    if (!name.has_value() || !offset.has_value() || !length.has_value() ||
        !stored_length.has_value() || !compression.has_value()) {
      yyjson_doc_free(doc);
      set_error(format_error, "ByteDist TOC chunk has invalid required fields.");
      return false;
    }

    if (!is_valid_chunk_name(*name)) {
      yyjson_doc_free(doc);
      set_error(format_error, "Invalid ByteDist chunk name.");
      return false;
    }

    if (!seen_names.insert(*name).second) {
      yyjson_doc_free(doc);
      set_error(format_error, "Duplicate ByteDist chunk name in TOC.");
      return false;
    }

    if (*compression == "none" && *stored_length != *length) {
      yyjson_doc_free(doc);
      set_error(compression_error, "ByteDist chunk has different stored and logical lengths without compression.");
      return false;
    }

    if (*offset < payload_header_length || *offset > toc_offset ||
        *stored_length > toc_offset - *offset) {
      yyjson_doc_free(doc);
      set_error(format_error, "ByteDist chunk points outside the chunk data region.");
      return false;
    }

    archive->chunks.push_back(Chunk{*name, *offset, *length, *stored_length, *compression});
  }

  yyjson_doc_free(doc);
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
