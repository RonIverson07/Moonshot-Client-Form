<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// 1) Set these values before uploading.
$RELAY_SECRET = 'CHANGE_ME_LONG_RANDOM_SECRET';
$FROM_EMAIL = 'quotation@moonshotdigital.com.ph';

// Basic hardening
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['success' => false, 'error' => 'Method not allowed']);
  exit;
}

$headers = function_exists('getallheaders') ? getallheaders() : [];
$providedSecret = '';
foreach ($headers as $k => $v) {
  if (strtolower((string)$k) === 'x-relay-secret') {
    $providedSecret = (string)$v;
    break;
  }
}

if ($providedSecret === '' || !hash_equals($RELAY_SECRET, $providedSecret)) {
  http_response_code(401);
  echo json_encode(['success' => false, 'error' => 'Unauthorized']);
  exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
  exit;
}

$to = trim((string)($data['notificationEmail'] ?? ''));
if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
  http_response_code(400);
  echo json_encode(['success' => false, 'error' => 'Missing or invalid notificationEmail']);
  exit;
}

$company = trim((string)($data['companyName'] ?? ''));
$contact = trim((string)($data['contactPerson'] ?? ''));
$email = trim((string)($data['email'] ?? ''));
$phone = trim((string)($data['phoneNumber'] ?? ''));
$submittedAt = trim((string)($data['submittedAt'] ?? ''));

$replyTo = trim((string)($data['replyTo'] ?? ''));

$subject = trim((string)($data['subject'] ?? ''));
$body = trim((string)($data['body'] ?? ''));
$isHtml = (bool)($data['isHtml'] ?? false);
if ($subject === '') $subject = 'Thank you for submitting application in our website.';
if ($body === '') $body = 'Thank you for submitting application in our website.';

$from = trim($FROM_EMAIL);
if ($from === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'FROM_EMAIL misconfigured']);
  exit;
}

$extraHeaders = [];
$extraHeaders[] = 'From: ' . $from;
$effectiveReplyTo = $replyTo !== '' ? $replyTo : $from;
if (filter_var($effectiveReplyTo, FILTER_VALIDATE_EMAIL)) {
  $extraHeaders[] = 'Reply-To: ' . $effectiveReplyTo;
}
$domain = '';
$atPos = strrpos($from, '@');
if ($atPos !== false) {
  $domain = substr($from, $atPos + 1);
}
if ($domain !== '') {
  $extraHeaders[] = 'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $domain . '>';
}
$extraHeaders[] = 'MIME-Version: 1.0';
$attachment = $data['attachment'] ?? null;

$message = $body;
if (is_array($attachment)) {
  $filename = trim((string)($attachment['filename'] ?? 'Attachment.pdf'));
  if ($filename === '') $filename = 'Attachment.pdf';

  $contentType = trim((string)($attachment['contentType'] ?? 'application/octet-stream'));
  if ($contentType === '') $contentType = 'application/octet-stream';

  $contentBase64 = (string)($attachment['contentBase64'] ?? '');
  $contentBase64 = preg_replace('/^data:[^,]+,/', '', $contentBase64);
  $contentBase64 = preg_replace('/\s+/', '', $contentBase64);

  if ($contentBase64 !== '') {
    $boundary = '=_Moonshot_' . bin2hex(random_bytes(16));
    $extraHeaders[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';

    $parts = [];
    $parts[] = "--{$boundary}\r\n" .
      ($isHtml ? "Content-Type: text/html; charset=UTF-8\r\n" : "Content-Type: text/plain; charset=UTF-8\r\n") .
      "Content-Transfer-Encoding: 8bit\r\n\r\n" .
      $body . "\r\n";
    $parts[] = "--{$boundary}\r\n" .
      "Content-Type: {$contentType}; name=\"{$filename}\"\r\n" .
      "Content-Transfer-Encoding: base64\r\n" .
      "Content-Disposition: attachment; filename=\"{$filename}\"\r\n\r\n" .
      chunk_split($contentBase64, 76, "\r\n") . "\r\n";
    $parts[] = "--{$boundary}--";

    $message = implode('', $parts);
  } else {
    $extraHeaders[] = $isHtml ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8';
  }
} else {
  $extraHeaders[] = $isHtml ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8';
}

$ok = @mail($to, $subject, $message, implode("\r\n", $extraHeaders), '-f ' . $from);
if (!$ok) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'mail() returned false']);
  exit;
}

echo json_encode(['success' => true]);
