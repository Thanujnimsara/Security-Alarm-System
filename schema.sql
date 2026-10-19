-- ========================================================
-- Restaurant Room Security & Booking Verification System
-- Database Schema for MySQL / XAMPP MariaDB
-- ========================================================

CREATE DATABASE IF NOT EXISTS restaurant_security;
USE restaurant_security;

-- 1. Rooms Table (Room 01 - Room 05)
CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_name VARCHAR(50) NOT NULL UNIQUE,
    door_status ENUM('OPEN', 'CLOSED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    room_status ENUM('AVAILABLE', 'BOOKED', 'OCCUPIED', 'CLEANING') NOT NULL DEFAULT 'AVAILABLE',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Users Table (Owner / Manager authentication)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('OWNER', 'MANAGER') NOT NULL,
    full_name VARCHAR(150),
    phone VARCHAR(30),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_code VARCHAR(30) NOT NULL UNIQUE,
    room_id INT NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(30),
    check_in DATETIME NOT NULL,
    check_out DATETIME NOT NULL,
    status ENUM('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED') NOT NULL DEFAULT 'BOOKED',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- 4. Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(40) DEFAULT 'CASH',
    payment_status ENUM('PENDING', 'PAID', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    recorded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- 5. Door Events Table (Records every sensor event from PST-G30 / Simulator)
CREATE TABLE IF NOT EXISTS door_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    door_status ENUM('OPEN', 'CLOSED') NOT NULL,
    event_time TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    source VARCHAR(50) NOT NULL DEFAULT 'TEST',
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- 6. Audit Logs Table (Tamper-Proof Manager Action Records)
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Security Alerts Table
CREATE TABLE IF NOT EXISTS security_alerts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    alert_type VARCHAR(100) NOT NULL,
    message VARCHAR(500) NOT NULL,
    status ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Initial Default Data (10 Rooms)
INSERT IGNORE INTO rooms (id, room_name, door_status, room_status) VALUES
(1, 'Room 01', 'OPEN', 'AVAILABLE'),
(2, 'Room 02', 'OPEN', 'AVAILABLE'),
(3, 'Room 03', 'OPEN', 'AVAILABLE'),
(4, 'Room 04', 'OPEN', 'AVAILABLE'),
(5, 'Room 05', 'OPEN', 'AVAILABLE'),
(6, 'Room 06', 'OPEN', 'AVAILABLE'),
(7, 'Room 07', 'OPEN', 'AVAILABLE'),
(8, 'Room 08', 'OPEN', 'AVAILABLE'),
(9, 'Room 09', 'OPEN', 'AVAILABLE'),
(10, 'Room 10', 'OPEN', 'AVAILABLE');

-- Default Demo Accounts (Owner and Manager)
INSERT IGNORE INTO users (id, username, password_hash, role, full_name, phone) VALUES
(1, 'owner', 'owner123', 'OWNER', 'Restaurant Owner', '+94771234567'),
(2, 'manager', 'manager123', 'MANAGER', 'Shift Manager', '+94779876543');
