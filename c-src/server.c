#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include "rudp.h"

#define PORT 8080

int main() {
    int sockfd;
    struct sockaddr_in server_addr, client_addr;
    socklen_t addr_len = sizeof(client_addr);
    RUDP_Packet buffer;

    if ((sockfd = socket(AF_INET, SOCK_DGRAM, 0)) < 0) {
        printf("[ERROR] Socket creation failed\n");
        exit(EXIT_FAILURE);
    }

    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    if (bind(sockfd, (const struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        printf("[ERROR] Bind failed\n");
        exit(EXIT_FAILURE);
    }
    
    printf("[SERVER] Started on port %d. Waiting for client...\n", PORT);

    recvfrom(sockfd, &buffer, sizeof(buffer), 0, (struct sockaddr *)&client_addr, &addr_len);
    if (buffer.header.flags == FLAG_SYN) {
        printf("[SERVER] <-- SYN received from client.\n");
        
        RUDP_Packet syn_ack;
        memset(&syn_ack, 0, sizeof(syn_ack));
        syn_ack.header.flags = FLAG_SYN | FLAG_ACK;
        
        sendto(sockfd, &syn_ack, sizeof(syn_ack), 0, (const struct sockaddr *)&client_addr, addr_len);
        printf("[SERVER] --> SYN-ACK sent.\n");
    }

    recvfrom(sockfd, &buffer, sizeof(buffer), 0, (struct sockaddr *)&client_addr, &addr_len);
    if (buffer.header.flags == FLAG_ACK) {
        printf("[SERVER] <-- ACK received. Handshake complete!\n");
        printf("[SERVER] Ready to receive data...\n");
        printf("------------------------------------------------\n");
    }

    uint32_t expected_seq = 1;

    while(1) {
        int n = recvfrom(sockfd, &buffer, sizeof(buffer), 0, (struct sockaddr *)&client_addr, &addr_len);
        
        if (n > 0 && buffer.header.flags == FLAG_DATA) {
            printf("[SERVER] <-- DATA received (Seq: %d, Bytes: %d)\n", buffer.header.seq_num, buffer.header.payload_len);
            
            uint16_t calc_check = calculate_checksum(buffer.payload, buffer.header.payload_len);
            
            if (calc_check == buffer.header.checksum) {
                printf("[SERVER] Checksum OK (0x%X). Payload: %s", calc_check, buffer.payload);
                
                RUDP_Packet ack_pkt;
                memset(&ack_pkt, 0, sizeof(ack_pkt));
                ack_pkt.header.flags = FLAG_ACK;
                ack_pkt.header.ack_num = buffer.header.seq_num;
                
                sendto(sockfd, &ack_pkt, sizeof(ack_pkt), 0, (const struct sockaddr *)&client_addr, addr_len);
                printf("[SERVER] --> ACK sent for Seq %d\n", buffer.header.seq_num);
                printf("------------------------------------------------\n");
                
                if (buffer.header.seq_num == expected_seq) {
                    expected_seq++;
                }
            } else {
                printf("[SERVER] [!] Checksum FAILED (Expected: 0x%X, Got: 0x%X). Dropping packet.\n", buffer.header.checksum, calc_check);
                printf("------------------------------------------------\n");
            }
        }
    }
    close(sockfd);
    return 0;
}