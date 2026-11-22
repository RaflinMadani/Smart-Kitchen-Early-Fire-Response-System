#pragma once
#include <Arduino.h>
#include <FS.h>
#include <LittleFS.h>
#include <map>

class EnvLoader {
private:
    std::map<String, String> envVars;

    // Trims whitespace and optional surrounding quotes (' or ")
    String cleanValue(String val) {
        val.trim();
        if (val.length() >= 2) {
            char first = val.charAt(0);
            char last = val.charAt(val.length() - 1);
            if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
                val = val.substring(1, val.length() - 1);
            }
        }
        return val;
    }

public:
    // Loads and parses the .env file from LittleFS
    bool load(const char* path = "/.env") {
        if (!LittleFS.begin(true)) {
            Serial.println("[EnvLoader] LittleFS mount failed");
            return false;
        }

        File file = LittleFS.open(path, "r");
        if (!file || file.isDirectory()) {
            Serial.printf("[EnvLoader] Failed to open %s\n", path);
            return false;
        }

        envVars.clear();

        while (file.available()) {
            String line = file.readStringUntil('\n');
            line.trim();

            // Skip empty lines and comments
            if (line.length() == 0 || line.startsWith("#")) {
                continue;
            }

            // Strip inline comments (outside of quotes)
            int commentIdx = -1;
            bool inQuotes = false;
            char quoteChar = 0;
            for (unsigned int i = 0; i < line.length(); i++) {
                char c = line.charAt(i);
                if ((c == '"' || c == '\'') && (i == 0 || line.charAt(i - 1) != '\\')) {
                    if (!inQuotes) {
                        inQuotes = true;
                        quoteChar = c;
                    } else if (c == quoteChar) {
                        inQuotes = false;
                    }
                } else if (c == '#' && !inQuotes) {
                    commentIdx = i;
                    break;
                }
            }
            if (commentIdx != -1) {
                line = line.substring(0, commentIdx);
                line.trim();
            }

            // Split on first '='
            int eqIdx = line.indexOf('=');
            if (eqIdx <= 0) continue; // Invalid line

            String key = line.substring(0, eqIdx);
            String val = line.substring(eqIdx + 1);

            key.trim();
            // Support optional "export KEY=VAL" syntax
            if (key.startsWith("export ")) {
                key = key.substring(7);
                key.trim();
            }

            envVars[key] = cleanValue(val);
        }

        file.close();
        return true;
    }

    // Retrieve a string value with an optional fallback
    String get(const String& key, const String& defaultVal = "") const {
        auto it = envVars.find(key);
        if (it != envVars.end()) {
            return it->second;
        }
        return defaultVal;
    }

    // Retrieve an integer value
    int getInt(const String& key, int defaultVal = 0) const {
        auto it = envVars.find(key);
        if (it != envVars.end() && it->second.length() > 0) {
            return it->second.toInt();
        }
        return defaultVal;
    }

    // Retrieve a boolean value (true/1/yes vs false/0/no)
    bool getBool(const String& key, bool defaultVal = false) const {
        auto it = envVars.find(key);
        if (it != envVars.end()) {
            String v = it->second;
            v.toLowerCase();
            if (v == "true" || v == "1" || v == "yes" || v == "on") return true;
            if (v == "false" || v == "0" || v == "no" || v == "off") return false;
        }
        return defaultVal;
    }

    // Clear map from RAM after extracting credentials
    void clear() {
        envVars.clear();
    }
};