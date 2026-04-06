#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/time.h>
#include "rudp.h"

#define PORT 8080

int main() {
    int sockfd;
    struct sockaddr_in server_addr;
    RUDP_Packet buffer;
    socklen_t addr_len = sizeof(server_addr);

    if ((sockfd = socket(AF_INET, SOCK_DGRAM, 0)) < 0) {
        printf("[ERROR] Socket creation failed\n");
        exit(EXIT_FAILURE);
    }

    struct timeval tv;
    tv.tv_sec = TIMEOUT_SEC;
    tv.tv_usec = 0;
    setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(PORT);
    server_addr.sin_addr.s_addr = INADDR_ANY;

    printf("[CLIENT] Initiating handshake...\n");
    
    RUDP_Packet syn_pkt;
    memset(&syn_pkt, 0, sizeof(syn_pkt));
    syn_pkt.header.flags = FLAG_SYN;
    sendto(sockfd, &syn_pkt, sizeof(syn_pkt), 0, (const struct sockaddr *)&server_addr, sizeof(server_addr));
    printf("[CLIENT] --> SYN sent.\n");

    int n = recvfrom(sockfd, &buffer, sizeof(buffer), 0, (struct sockaddr *)&server_addr, &addr_len);
    if (n > 0 && (buffer.header.flags == (FLAG_SYN | FLAG_ACK))) {
        printf("[CLIENT] <-- SYN-ACK received.\n");
        
        RUDP_Packet ack_pkt;
        memset(&ack_pkt, 0, sizeof(ack_pkt));
        ack_pkt.header.flags = FLAG_ACK;
        sendto(sockfd, &ack_pkt, sizeof(ack_pkt), 0, (const struct sockaddr *)&server_addr, sizeof(server_addr));
        printf("[CLIENT] --> ACK sent. Handshake complete!\n");
        printf("------------------------------------------------\n");
    } else {
        printf("[CLIENT] [!] Handshake failed or timed out. Exiting.\n");
        return 1;
    }

    uint32_t current_seq = 1;
    char input_buffer[MAX_PAYLOAD];

    while (1) {
        printf("Enter message to send: ");
        if (fgets(input_buffer, sizeof(input_buffer), stdin) == NULL) {
            break;
        }

        RUDP_Packet data_pkt;
        memset(&data_pkt, 0, sizeof(data_pkt));
        data_pkt.header.flags = FLAG_DATA;
        data_pkt.header.seq_num = current_seq;
        data_pkt.header.payload_len = strlen(input_buffer) + 1;
        strcpy(data_pkt.payload, input_buffer);
        data_pkt.header.checksum = calculate_checksum(data_pkt.payload, data_pkt.header.payload_len);

        int acked = 0;
        while (!acked) {
            printf("[CLIENT] --> Sending DATA (Seq: %d, Checksum: 0x%X)\n", current_seq, data_pkt.header.checksum);
            sendto(sockfd, &data_pkt, sizeof(data_pkt), 0, (const struct sockaddr *)&server_addr, sizeof(server_addr));

            n = recvfrom(sockfd, &buffer, sizeof(buffer), 0, (struct sockaddr *)&server_addr, &addr_len);
            
            if (n < 0) {
                printf("[CLIENT] [!] Timeout waiting for ACK. Retransmitting Seq %d...\n", current_seq);
            } else if (buffer.header.flags == FLAG_ACK && buffer.header.ack_num == current_seq) {
                printf("[CLIENT] <-- ACK received for Seq %d. Delivery successful!\n", current_seq);
                printf("------------------------------------------------\n");
                acked = 1;
                current_seq++;
            }
        }
    }

    close(sockfd);
    return 0;
}