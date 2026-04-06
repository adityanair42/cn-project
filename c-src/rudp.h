#ifndef RUDP_H
#define RUDP_H

#include <stdint.h>
#include <stddef.h>

#define MAX_PAYLOAD 1024
#define TIMEOUT_SEC 2

#define FLAG_SYN  0x01
#define FLAG_ACK  0x02
#define FLAG_DATA 0x04

typedef struct {
    uint8_t  flags;
    uint32_t seq_num;
    uint32_t ack_num;
    uint16_t checksum;
    uint16_t payload_len;
} RUDP_Header;

typedef struct {
    RUDP_Header header;
    char payload[MAX_PAYLOAD];
} RUDP_Packet;

uint16_t calculate_checksum(const char* data, size_t len) {
    uint16_t checksum = 0;
    for (size_t i = 0; i < len; ++i) {
        checksum ^= data[i];
    }
    return checksum;
}

#endif