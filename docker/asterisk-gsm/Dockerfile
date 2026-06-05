FROM debian:12

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libxml2-dev \
    libncurses5-dev \
    uuid-dev \
    libjansson-dev \
    libsqlite3-dev \
    git \
    wget \
    curl \
    usbutils \
    libusb-1.0-0-dev \
    autoconf \
    automake \
    libtool \
    && rm -rf /var/lib/apt/lists/*

# Clone and build chan_dongle for GSM modem support
WORKDIR /opt
RUN git clone https://github.com/wdoekes/chan_dongle.git
WORKDIR /opt/chan_dongle
RUN aclocal && autoconf && automake -a && ./configure && make && make install

# Download and build Asterisk
WORKDIR /opt
RUN wget http://downloads.asterisk.org/pub/telephony/asterisk/asterisk-18-current.tar.gz
RUN tar xzf asterisk-18-current.tar.gz
WORKDIR /opt/asterisk-18.*
RUN ./contrib/scripts/get_mp3_source.sh
RUN ./configure --with-pjproject-bundled
RUN make menuselect.makeopts
RUN make menuselect
# Enable core sounds and modules
RUN make menuselect.menuselect && \
    menuselect/menuselect --enable app_macro && \
    menuselect/menuselect --enable app_dial && \
    menuselect/menuselect --enable app_playback && \
    menuselect/menuselect --enable app_read && \
    menuselect/menuselect --enable app_verbose && \
    menuselect/menuselect --enable res_rtp_asterisk && \
    menuselect/menuselect --enable codec_ulaw && \
    menuselect/menuselect --enable codec_alaw && \
    menuselect/menuselect --enable format_wav && \
    menuselect/menuselect --enable format_mp3 && \
    menuselect/menuselect --enable res_musiconhold && \
    menuselect/menuselect --enable func_strings && \
    menuselect/menuselect --enable pbx_config

RUN make
RUN make install
RUN make samples
RUN make config

# Install chan_dongle module
RUN cp /opt/chan_dongle/chan_dongle.so /usr/lib/asterisk/modules/
RUN cp /opt/chan_dongle/etc/dongle.conf /etc/asterisk/

# Create directories
RUN mkdir -p /var/lib/asterisk/sounds /var/spool/asterisk/monitor /var/spool/asterisk/voicemail

# Copy configuration files
COPY asterisk.conf /etc/asterisk/
COPY extensions.conf /etc/asterisk/
COPY sip.conf /etc/asterisk/
COPY dongle.conf /etc/asterisk/

# Expose SIP ports
EXPOSE 5060/udp 5060/tcp 10000-20000/udp

# Start Asterisk
CMD ["asterisk", "-cvvv"]
